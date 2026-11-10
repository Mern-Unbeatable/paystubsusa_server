import { AppError, conflict, forbidden, notFound, unauthorized, validation } from "../../shared/http/app-error.ts";
import { hashPassword, isCommonPassword, verifyAgainstDummy, verifyPassword } from "../../shared/crypto/password.ts";
import type { TransactionManager, Tx } from "../../shared/db/transaction.ts";
import type { RequestContext } from "../../shared/types.ts";
import type { AuditService } from "../audit/index.ts";
import type { VerificationService } from "../verification/index.ts";
import type { UserRepository, UserRow } from "./repositories/user.repository.ts";
import type { SessionService } from "./session.service.ts";

/** Implemented by the orders module; wired in the container to avoid an import cycle. */
export interface GuestOrderLinker {
  linkGuestOrders(userId: string, email: string, tx?: Tx): Promise<number>;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: "customer" | "admin";
  emailVerified: boolean;
  phone: string | null;
  /** Relative to the API base (e.g. `/avatars/<id>.webp`); null when none is set. */
  avatarUrl: string | null;
  createdAt: Date;
}

export const toUserDto = (u: UserRow): UserDto => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  emailVerified: u.emailVerifiedAt !== null,
  phone: u.phone,
  avatarUrl: u.avatarKey ? `/${u.avatarKey}` : null,
  createdAt: u.createdAt,
});

export function assertPasswordAllowed(password: string, field = "password") {
  if (isCommonPassword(password)) throw validation({ [field]: ["This password is too common. Choose another one."] });
}

interface Deps {
  users: UserRepository;
  sessions: SessionService;
  verification: VerificationService;
  audit: AuditService;
  orders: GuestOrderLinker;
  tx: TransactionManager;
}

export class AuthService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  /** Role is always `customer`; linking waits for email verification. */
  async register(input: { name: string; email: string; password: string }, ctx: RequestContext) {
    assertPasswordAllowed(input.password);
    const passwordHash = await hashPassword(input.password);
    const user = await this.d.tx.run(async (tx) => {
      const created = await this.d.users.create({ email: input.email, name: input.name, passwordHash, role: "customer" }, tx);
      if (!created) throw conflict("EMAIL_TAKEN", "An account with this email already exists");
      await this.d.verification.sendEmailVerification(created, ctx.ip ?? null, tx);
      return created;
    });
    return this.d.sessions.issue(user, false, ctx);
  }

  async login(input: { email: string; password: string; rememberMe: boolean }, ctx: RequestContext) {
    const user = await this.d.users.findByEmail(input.email);
    const ok = user ? await verifyPassword(user.passwordHash, input.password) : await verifyAgainstDummy(input.password);
    if (!user || !ok) throw unauthorized("INVALID_CREDENTIALS", "Incorrect email or password");
    if (user.status !== "active") throw forbidden("ACCOUNT_SUSPENDED", "This account has been suspended");

    await this.d.users.touchLastLogin(user.id);
    if (user.emailVerifiedAt) await this.d.orders.linkGuestOrders(user.id, user.email);
    return this.d.sessions.issue(user, input.rememberMe, ctx);
  }

  refresh(refreshToken: string | undefined, ctx: RequestContext) {
    if (!refreshToken) throw unauthorized("REFRESH_MISSING", "Your session expired. Please sign in again.");
    return this.d.sessions.rotate(refreshToken, ctx);
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) await this.d.sessions.revoke(refreshToken);
  }

  async me(userId: string) {
    const user = await this.d.users.findById(userId);
    if (!user) throw unauthorized("TOKEN_EXPIRED", "Your session expired. Please sign in again.");
    return toUserDto(user);
  }

  /** Always succeeds from the caller's view so it never reveals whether an account exists. */
  async forgotPassword(email: string, ctx: RequestContext) {
    const user = await this.d.users.findByEmail(email);
    if (user && user.status === "active") await this.d.verification.sendPasswordReset(user, ctx.ip ?? null);
  }

  async resetPassword(token: string, password: string, ctx: RequestContext) {
    assertPasswordAllowed(password);
    const { userId } = await this.d.verification.consumeResetToken(token);
    const passwordHash = await hashPassword(password);
    await this.d.tx.run(async (tx) => {
      await this.d.users.updatePassword(userId, passwordHash, tx);
      await this.d.sessions.revokeAll(userId, undefined, tx);
      await this.d.audit.record({ actorType: "customer", actorId: userId, action: "auth.password_reset", targetType: "user", targetId: userId, ip: ctx.ip }, tx);
    });
  }

  async resendEmailVerification(userId: string, ctx: RequestContext) {
    const user = await this.d.users.findById(userId);
    if (!user) throw notFound();
    if (user.emailVerifiedAt) throw conflict("EMAIL_ALREADY_VERIFIED", "Your email is already verified");
    const { resendAvailableAt } = await this.d.verification.sendEmailVerification(user, ctx.ip ?? null);
    return { resendAvailableAt };
  }

  /** Verifies the email and links guest orders placed with it (spec section 14.5). */
  async verifyEmail(userId: string, code: string, ctx: RequestContext) {
    const user = await this.d.users.findById(userId);
    if (!user) throw notFound();
    if (user.emailVerifiedAt) throw conflict("EMAIL_ALREADY_VERIFIED", "Your email is already verified");
    const email = await this.d.verification.verifyEmailCode(userId, code);
    if (email !== user.email) throw new AppError("CODE_EXPIRED", 422, "This code has expired. Request a new one.");

    const updated = await this.d.tx.run(async (tx) => {
      const verified = await this.d.users.markEmailVerified(userId, tx);
      const linked = await this.d.orders.linkGuestOrders(userId, verified.email, tx);
      await this.d.audit.record(
        { actorType: "customer", actorId: userId, action: "orders.linked", targetType: "user", targetId: userId, metadata: { count: linked }, ip: ctx.ip },
        tx,
      );
      return verified;
    });
    return toUserDto(updated);
  }
}
