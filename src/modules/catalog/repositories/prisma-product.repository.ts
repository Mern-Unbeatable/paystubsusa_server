import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../../shared/db/prisma.ts";
import { skipTake, type PageRequest } from "../../../shared/http/pagination.ts";
import type { NewProduct, ProductFilter, ProductRepository, ProductUpdate } from "./product.repository.ts";

const withUsage = { _count: { select: { orderItems: true, subscriptions: true } } } as const;

const toUsage = <T extends { _count: { orderItems: number; subscriptions: number } }>({ _count, ...row }: T) => ({
  ...row,
  usage: { orderItems: _count.orderItems, subscriptions: _count.subscriptions },
});

export class PrismaProductRepository implements ProductRepository {
  list({ activeOnly }: { activeOnly: boolean }) {
    return prisma.product.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
  }

  async search(filter: ProductFilter, page: PageRequest) {
    const q = filter.q?.trim();
    const where: Prisma.ProductWhereInput = {
      kind: filter.kind,
      documentType: filter.documentType,
      isActive: filter.isActive,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: withUsage,
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        ...skipTake(page),
      }),
      prisma.product.count({ where }),
    ]);
    return { items: items.map(toUsage), total };
  }

  findByCodes(codes: string[]) {
    return prisma.product.findMany({ where: { code: { in: codes } } });
  }

  findByCode(code: string) {
    return prisma.product.findUnique({ where: { code } });
  }

  async findWithUsage(code: string) {
    const row = await prisma.product.findUnique({ where: { code }, include: withUsage });
    return row ? toUsage(row) : null;
  }

  async create(input: NewProduct) {
    try {
      return await prisma.product.create({ data: { ...input, kind: "one_time", currency: "usd" } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
      throw err;
    }
  }

  update(code: string, input: ProductUpdate) {
    return prisma.product.update({ where: { code }, data: input });
  }

  async delete(id: string) {
    try {
      await prisma.product.delete({ where: { id } });
      return true;
    } catch (err) {
      // P2003: still referenced (FK restrict); P2025: already deleted.
      if (err instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2025"].includes(err.code)) return false;
      throw err;
    }
  }
}
