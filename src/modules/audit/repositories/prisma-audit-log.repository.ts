import type { Prisma } from "../../../generated/prisma/client.ts";
import { dbOf, prisma } from "../../../shared/db/prisma.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import { skipTake, type PageRequest } from "../../../shared/http/pagination.ts";
import type { AuditEntry, AuditLogFilter, AuditLogRepository } from "./audit-log.repository.ts";

export class PrismaAuditLogRepository implements AuditLogRepository {
  async create(entry: AuditEntry, tx?: Tx) {
    await dbOf(tx).auditLog.create({
      data: {
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: entry.ip ?? null,
      },
    });
  }

  async list(filter: AuditLogFilter, page: PageRequest) {
    const where: Prisma.AuditLogWhereInput = {
      actorId: filter.actorId,
      action: filter.action,
      createdAt: { gte: filter.from, lte: filter.to },
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(page) }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }

  recent(limit: number) {
    return prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  }
}
