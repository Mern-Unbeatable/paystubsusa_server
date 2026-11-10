import type { Tx } from "../../../shared/db/transaction.ts";

export interface RefreshSessionRow {
  id: string;
  userId: string;
  familyId: string;
  rememberMe: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

export interface RefreshSessionRepository {
  create(
    input: { userId: string; familyId: string; tokenHash: string; rememberMe: boolean; userAgent: string | null; ip: string | null; expiresAt: Date },
    tx?: Tx,
  ): Promise<string>;
  findByTokenHash(tokenHash: string): Promise<RefreshSessionRow | null>;
  /** Revokes `id` in favour of `replacedById` only if still active; false means it was already used. */
  markReplaced(id: string, replacedById: string, tx: Tx): Promise<boolean>;
  revoke(id: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
  revokeAllForUser(userId: string, exceptId?: string, tx?: Tx): Promise<void>;
  deleteStaleBefore(before: Date): Promise<number>;
}
