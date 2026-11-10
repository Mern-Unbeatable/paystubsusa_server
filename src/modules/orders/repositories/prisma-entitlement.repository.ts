import type { DocumentType } from "../../../generated/prisma/enums.ts";
import { dbOf, prisma } from "../../../shared/db/prisma.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import type { EntitlementRepository } from "./entitlement.repository.ts";

export class PrismaEntitlementRepository implements EntitlementRepository {
  async create(input: { orderId: string; documentType: DocumentType; creditsTotal: number; creditsUsed: number }, tx: Tx) {
    return (await dbOf(tx).entitlement.create({ data: input, select: { id: true } })).id;
  }

  findWithOrder(id: string) {
    return prisma.entitlement.findUnique({
      where: { id },
      include: { order: { select: { id: true, userId: true, email: true, status: true } } },
    });
  }

  listForOrder(orderId: string) {
    return prisma.entitlement.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
  }

  async consumeCredit(id: string, tx: Tx) {
    const n = await dbOf(tx).$executeRaw`
      UPDATE entitlements SET credits_used = credits_used + 1
      WHERE id = ${id}::uuid AND credits_used < credits_total
        AND (expires_at IS NULL OR expires_at > now())`;
    return n === 1;
  }
}
