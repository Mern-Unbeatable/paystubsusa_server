import type { ChallengePurpose } from "../../generated/prisma/enums.ts";
import { env } from "../../config/env.ts";
import { AppError, tooManyRequests } from "../../shared/http/app-error.ts";
import { pepperedHash, randomToken, safeEqual, sixDigitCode, uuidv7 } from "../../shared/crypto/tokens.ts";
import { signGuestToken } from "../../shared/crypto/jwt.ts";
import type { TransactionManager, Tx } from "../../shared/db/transaction.ts";
import type { NotificationsService } from "../notifications/index.ts";
import type { VerificationChallengeRepository } from "./repositories/verification-challenge.repository.ts";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESET_TTL_MS = 30 * 60 * 1000;
export const RESEND_COOLDOWN_SECONDS = 30;

type CheckOutcome =
  | { ok: true; email: string; userId: string | null }
  | { ok: false; reason: "invalid"; attemptsRemaining: number }
  | { ok: false; reason: "expired" | "locked" };

interface Deps {
  challenges: VerificationChallengeRepository;
  notifications: NotificationsService;
  tx: TransactionManager;
}

const secretHash = (challengeId: string, secret: string) => pepperedHash(`${challengeId}|${secret}`);

export class VerificationService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  private async issue(
    input: { email: string; userId: string | null; purpose: ChallengePurpose; secret: string; ttlMs: number; ip: string | null },
    tx: Tx,
  ) {
    const id = uuidv7();
    const expiresAt = new Date(Date.now() + input.ttlMs);
    await this.d.challenges.invalidateOpen(input.email, input.purpose, tx);
    await this.d.challenges.create(
      { id, email: input.email, userId: input.userId, purpose: input.purpose, secretHash: secretHash(id, input.secret), expiresAt, ip: input.ip },
      tx,
    );
    return { challengeId: id, expiresAt, resendAvailableAt: new Date(Date.now() + RESEND_COOLDOWN_SECONDS * 1000) };
  }

  /** POST /verifications. Responds the same whether or not the email has orders or an account. */
  sendCode(email: string, purpose: "checkout" | "document_access", ip: string | null) {
    return this.d.tx.run(async (tx) => {
      const code = sixDigitCode();
      const result = await this.issue({ email, userId: null, purpose, secret: code, ttlMs: CODE_TTL_MS, ip }, tx);
      await this.d.notifications.enqueue("verification_code", email, { code, purpose }, { tx });
      return result;
    });
  }

  sendEmailVerification(user: { id: string; email: string; name: string }, ip: string | null, tx?: Tx) {
    const run = async (t: Tx) => {
      const code = sixDigitCode();
      const result = await this.issue({ email: user.email, userId: user.id, purpose: "email_verification", secret: code, ttlMs: CODE_TTL_MS, ip }, t);
      await this.d.notifications.enqueue("email_verification", user.email, { code, name: user.name }, { tx: t });
      return result;
    };
    return tx ? run(tx) : this.d.tx.run(run);
  }

  sendPasswordReset(user: { id: string; email: string; name: string }, ip: string | null) {
    return this.d.tx.run(async (tx) => {
      const secret = randomToken();
      const { challengeId } = await this.issue({ email: user.email, userId: user.id, purpose: "password_reset", secret, ttlMs: RESET_TTL_MS, ip }, tx);
      const resetUrl = `${env.APP_URL}/reset-password?token=${encodeURIComponent(`${challengeId}.${secret}`)}`;
      await this.d.notifications.enqueue("password_reset", user.email, { resetUrl, name: user.name }, { tx });
    });
  }

  /** POST /verifications/{id}/verify → guest token. */
  async verifyCode(challengeId: string, code: string) {
    const outcome = await this.check(challengeId, code, ["checkout", "document_access"]);
    const { email } = this.assertOk(outcome);
    const { token, expiresAt } = await signGuestToken(email);
    return { guestToken: token, email, expiresAt };
  }

  /** Customer email verification: the latest open code for this user. Returns the verified email. */
  async verifyEmailCode(userId: string, code: string): Promise<string> {
    const id = await this.d.challenges.latestOpenIdForUser(userId, "email_verification");
    if (!id) throw new AppError("CODE_EXPIRED", 422, "This code has expired. Request a new one.");
    const outcome = await this.check(id, code, ["email_verification"]);
    const ok = this.assertOk(outcome);
    if (ok.userId !== userId) throw new AppError("CODE_INVALID", 422, "The code is incorrect");
    return ok.email;
  }

  /** Validates and consumes a `challengeId.secret` reset token. */
  async consumeResetToken(token: string): Promise<{ userId: string; email: string }> {
    const [id, secret] = token.split(".", 2);
    const invalid = new AppError("RESET_TOKEN_INVALID", 422, "This reset link is invalid or has expired");
    if (!id || !secret || !/^[0-9a-f-]{36}$/i.test(id)) throw invalid;
    const outcome = await this.check(id, secret, ["password_reset"]);
    if (!outcome.ok || !outcome.userId) throw invalid;
    return { userId: outcome.userId, email: outcome.email };
  }

  /** Locks the challenge, then commits attempts/consumption before the caller throws. */
  private check(challengeId: string, secret: string, purposes: ChallengePurpose[]): Promise<CheckOutcome> {
    return this.d.tx.run(async (tx): Promise<CheckOutcome> => {
      const c = await this.d.challenges.lockById(challengeId, tx);
      if (!c || !purposes.includes(c.purpose)) return { ok: false, reason: "invalid", attemptsRemaining: 0 };
      if (c.attempts >= c.maxAttempts) return { ok: false, reason: "locked" };
      if (c.consumedAt || c.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

      if (safeEqual(c.secretHash, secretHash(c.id, secret))) {
        await this.d.challenges.consume(c.id, tx);
        return { ok: true, email: c.email, userId: c.userId };
      }
      const attempts = await this.d.challenges.incrementAttempts(c.id, tx);
      return attempts >= c.maxAttempts
        ? { ok: false, reason: "locked" }
        : { ok: false, reason: "invalid", attemptsRemaining: c.maxAttempts - attempts };
    });
  }

  private assertOk(outcome: CheckOutcome) {
    if (outcome.ok) return outcome;
    if (outcome.reason === "locked") {
      throw tooManyRequests(Math.ceil(CODE_TTL_MS / 1000), "CHALLENGE_LOCKED", "Too many incorrect attempts. Request a new code.");
    }
    if (outcome.reason === "expired") throw new AppError("CODE_EXPIRED", 422, "This code has expired. Request a new one.");
    throw new AppError("CODE_INVALID", 422, "The code is incorrect", {
      errors: { code: ["The code is incorrect"] },
      details: { attemptsRemaining: "attemptsRemaining" in outcome ? outcome.attemptsRemaining : 0 },
    });
  }
}
