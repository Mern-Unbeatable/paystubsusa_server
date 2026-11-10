import { randomUUID } from "node:crypto";
import { forbidden, unauthorized } from "../../shared/http/app-error.ts";
import { randomToken, sha256 } from "../../shared/crypto/tokens.ts";
import { signAccessToken } from "../../shared/crypto/jwt.ts";
import type { TransactionManager, Tx } from "../../shared/db/transaction.ts";
import type { RequestContext } from "../../shared/types.ts";
import type { AuditService } from "../audit/index.ts";
import type { RefreshSessionRepository } from "./repositories/refresh-session.repository.ts";
import type { UserRepository, UserRow } from "./repositories/user.repository.ts";

export const REMEMBER_ME_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  /** Persistent cookie (Max-Age) only when the user chose "remember me". */
  rememberMe: boolean;
  user: UserRow;
  sessionId: string;
}

interface Deps {
  sessions: RefreshSessionRepository;
  users: UserRepository;
  audit: AuditService;
  tx: TransactionManager;
}

export class SessionService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  async issue(user: UserRow, rememberMe: boolean, ctx: RequestContext, familyId: string = randomUUID(), tx?: Tx): Promise<IssuedSession> {
    const refreshToken = randomToken();
    const sessionId = await this.d.sessions.create(
      {
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        rememberMe,
        userAgent: ctx.userAgent?.slice(0, 500) ?? null,
        ip: ctx.ip ?? null,
        expiresAt: new Date(Date.now() + (rememberMe ? REMEMBER_ME_TTL_MS : SESSION_TTL_MS)),
      },
      tx,
    );
    return { accessToken: await signAccessToken(user.id, user.role, sessionId), refreshToken, rememberMe, user, sessionId };
  }

  /** Rotation with reuse detection: presenting an already-rotated token revokes the whole family. */
  async rotate(refreshToken: string, ctx: RequestContext): Promise<IssuedSession> {
    const session = await this.d.sessions.findByTokenHash(sha256(refreshToken));
    if (!session) throw unauthorized("REFRESH_INVALID", "Your session expired. Please sign in again.");

    if (session.revokedAt) {
      if (session.replacedById) {
        await this.d.sessions.revokeFamily(session.familyId);
        await this.d.audit.record({ actorType: "system", action: "auth.refresh_reuse_detected", targetType: "user", targetId: session.userId, ip: ctx.ip });
      }
      throw unauthorized("REFRESH_INVALID", "Your session expired. Please sign in again.");
    }
    if (session.expiresAt.getTime() <= Date.now()) throw unauthorized("REFRESH_EXPIRED", "Your session expired. Please sign in again.");

    const user = await this.d.users.findById(session.userId);
    if (!user) throw unauthorized("REFRESH_INVALID", "Your session expired. Please sign in again.");
    if (user.status !== "active") {
      await this.d.sessions.revokeFamily(session.familyId);
      throw forbidden("ACCOUNT_SUSPENDED", "This account has been suspended");
    }

    const next = await this.d.tx.run(async (tx) => {
      const issued = await this.issue(user, session.rememberMe, ctx, session.familyId, tx);
      return (await this.d.sessions.markReplaced(session.id, issued.sessionId, tx)) ? issued : null;
    });
    if (!next) {
      // A concurrent request rotated this token first: treat as reuse.
      await this.d.sessions.revokeFamily(session.familyId);
      throw unauthorized("REFRESH_INVALID", "Your session expired. Please sign in again.");
    }
    return next;
  }

  async revoke(refreshToken: string) {
    const session = await this.d.sessions.findByTokenHash(sha256(refreshToken));
    if (session) await this.d.sessions.revoke(session.id);
  }

  /** Revokes every session of the user, optionally keeping the caller's (access token `sid`). */
  async revokeAll(userId: string, keepSessionId?: string | null, tx?: Tx) {
    await this.d.sessions.revokeAllForUser(userId, keepSessionId ?? undefined, tx);
  }
}
