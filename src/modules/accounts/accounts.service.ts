import { randomUUID } from "node:crypto";
import { notFound, validation } from "../../shared/http/app-error.ts";
import { hashPassword, verifyPassword } from "../../shared/crypto/password.ts";
import type { TransactionManager } from "../../shared/db/transaction.ts";
import type { RequestContext } from "../../shared/types.ts";
import { logger } from "../../shared/logger.ts";
import type { ObjectStorage } from "../../integrations/storage.ts";
import type { AuditService } from "../audit/index.ts";
import { assertPasswordAllowed, toUserDto, type SessionService, type UserRepository } from "../auth/index.ts";
import { normalizeAvatar } from "./avatar.ts";

interface Deps {
  users: UserRepository;
  sessions: SessionService;
  audit: AuditService;
  tx: TransactionManager;
  storage: ObjectStorage;
}

export class AccountsService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  /** Email changes are a separate re-verification flow ([DECISION] 14), so only name and phone. */
  async updateProfile(userId: string, input: { name?: string; phone?: string | null }) {
    if (!(await this.d.users.findById(userId))) throw notFound();
    return toUserDto(await this.d.users.updateProfile(userId, input));
  }

  /** Each upload gets a fresh random key, so the URL changes (cache-busting) and is unguessable. */
  async setAvatar(userId: string, image: Buffer) {
    const user = await this.d.users.findById(userId);
    if (!user) throw notFound();
    const key = `avatars/${randomUUID()}.webp`;
    await this.d.storage.put(key, await normalizeAvatar(image), "image/webp");
    const updated = await this.d.users.setAvatarKey(userId, key);
    if (user.avatarKey) this.deleteObject(user.avatarKey);
    return toUserDto(updated);
  }

  async removeAvatar(userId: string) {
    const user = await this.d.users.findById(userId);
    if (!user) throw notFound();
    if (!user.avatarKey) return toUserDto(user);
    const updated = await this.d.users.setAvatarKey(userId, null);
    this.deleteObject(user.avatarKey);
    return toUserDto(updated);
  }

  getAvatar(key: string) {
    return this.d.storage.get(key);
  }

  private deleteObject(key: string) {
    this.d.storage.delete(key).catch((err) => logger.warn({ err }, "Could not delete old avatar"));
  }

  /** Keeps the caller's current session; every other session is revoked. */
  async changePassword(
    userId: string,
    input: { currentPassword: string; newPassword: string },
    currentSessionId: string | null,
    ctx: RequestContext,
  ) {
    const user = await this.d.users.findById(userId);
    if (!user) throw notFound();
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw validation({ currentPassword: ["Current password is incorrect"] });
    }
    assertPasswordAllowed(input.newPassword, "newPassword");
    const passwordHash = await hashPassword(input.newPassword);
    await this.d.tx.run(async (tx) => {
      await this.d.users.updatePassword(userId, passwordHash, tx);
      await this.d.sessions.revokeAll(userId, currentSessionId, tx);
      await this.d.audit.record({ actorType: user.role, actorId: userId, action: "account.password_change", targetType: "user", targetId: userId, ip: ctx.ip }, tx);
    });
  }
}
