import { prisma } from "../../../shared/db/prisma.ts";
import type { ProductRepository } from "./product.repository.ts";

export class PrismaProductRepository implements ProductRepository {
  list({ activeOnly }: { activeOnly: boolean }) {
    return prisma.product.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
  }

  findByCodes(codes: string[]) {
    return prisma.product.findMany({ where: { code: { in: codes } } });
  }

  findByCode(code: string) {
    return prisma.product.findUnique({ where: { code } });
  }

  update(code: string, input: { amountCents?: number; isActive?: boolean; stripePriceId?: string | null }) {
    return prisma.product.update({ where: { code }, data: input });
  }
}
