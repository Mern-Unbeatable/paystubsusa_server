import { dbOf, prisma } from "../../../shared/db/prisma.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import type { RefreshSessionRepository } from "./refresh-session.repository.ts";

export class PrismaRefreshSessionRepository implements RefreshSessionRepository {
  async create(
    input: { userId: string; familyId: string; tokenHash: string; rememberMe: boolean; userAgent: string | null; ip: string | null; expiresAt: Date },
    tx?: Tx,
  ) {
    return (await dbOf(tx).refreshSession.create({ data: input, select: { id: true } })).id;
  }

  findByTokenHash(tokenHash: string) {
    return prisma.refreshSession.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, familyId: true, rememberMe: true, expiresAt: true, revokedAt: true, replacedById: true },
    });
  }

  async markReplaced(id: string, replacedById: string, tx: Tx) {
    const { count } = await dbOf(tx).refreshSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById },
    });
    return count === 1;
  }

  async revoke(id: string) {
    await prisma.refreshSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeFamily(familyId: string) {
    await prisma.refreshSession.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string, exceptId?: string, tx?: Tx) {
    await dbOf(tx).refreshSession.updateMany({
      where: { userId, revokedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  async deleteStaleBefore(before: Date) {
    const { count } = await prisma.refreshSession.deleteMany({
      where: { OR: [{ expiresAt: { lt: before } }, { revokedAt: { lt: before } }] },
    });
    return count;
  }
}
