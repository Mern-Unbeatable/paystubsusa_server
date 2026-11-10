import type { OrderStatus } from "../../../generated/prisma/enums.ts";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { dbOf, isUniqueViolation, prisma } from "../../../shared/db/prisma.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import { skipTake, type PageRequest } from "../../../shared/http/pagination.ts";
import type { OwnerScope } from "../../../shared/policies/access.ts";
import type { NewOrder, OrderListFilter, OrderRepository, OrderRow } from "./order.repository.ts";

const select = {
  id: true,
  orderNumber: true,
  userId: true,
  email: true,
  emailVerifiedAt: true,
  documentType: true,
  status: true,
  subtotalCents: true,
  totalCents: true,
  currency: true,
  createdAt: true,
  paidAt: true,
  items: {
    select: { productId: true, productCode: true, name: true, quantity: true, unitAmountCents: true, amountCents: true },
  },
} as const;

function scopeWhere(scope: OwnerScope): Prisma.OrderWhereInput {
  if (scope.kind === "admin") return {};
  return scope.kind === "user" ? { userId: scope.userId } : { email: scope.email };
}

export class PrismaOrderRepository implements OrderRepository {
  async create({ items, ...order }: NewOrder, tx: Tx) {
    const db = dbOf(tx);
    const [{ number } = { number: "" }] = await db.$queryRaw<{ number: string }[]>`
      SELECT 'PS-' || to_char(now() AT TIME ZONE 'utc', 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0') AS number`;
    try {
      // Savepoint: a duplicate key must not abort the caller's transaction.
      await db.$executeRaw`SAVEPOINT order_create`;
      const created = await db.order.create({ data: { ...order, orderNumber: number, items: { create: items } }, select });
      await db.$executeRaw`RELEASE SAVEPOINT order_create`;
      return created;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      await db.$executeRaw`ROLLBACK TO SAVEPOINT order_create`;
      return null;
    }
  }

  findByIdempotencyKey(key: string) {
    return prisma.order.findUnique({ where: { idempotencyKey: key }, select });
  }

  findById(id: string) {
    return prisma.order.findUnique({ where: { id }, select });
  }

  async lockById(id: string, tx: Tx) {
    const db = dbOf(tx);
    const locked = await db.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;
    return db.order.findUnique({ where: { id }, select });
  }

  async updateStatus(id: string, status: OrderStatus, tx: Tx, paidAt?: Date) {
    await dbOf(tx).order.update({ where: { id }, data: { status, ...(paidAt ? { paidAt } : {}) } });
  }

  async setUserIfNull(id: string, userId: string, tx: Tx) {
    await dbOf(tx).order.updateMany({ where: { id, userId: null }, data: { userId } });
  }

  async linkGuestOrders(userId: string, email: string, tx?: Tx) {
    const { count } = await dbOf(tx).order.updateMany({ where: { userId: null, email }, data: { userId } });
    return count;
  }

  async list(scope: OwnerScope, filter: OrderListFilter, page: PageRequest) {
    const q = filter.q?.trim();
    const where: Prisma.OrderWhereInput = {
      AND: [
        scopeWhere(scope),
        filter.status ? { status: filter.status } : {},
        filter.documentType ? { documentType: filter.documentType } : {},
        { createdAt: { gte: filter.from, lte: filter.to } },
        q
          ? { OR: [{ orderNumber: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
          : {},
      ],
    };
    const [items, total] = await Promise.all([
      prisma.order.findMany({ where, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...skipTake(page) }),
      prisma.order.count({ where }),
    ]);
    return { items: items as OrderRow[], total };
  }

  async creditsForOrder(orderId: string, tx: Tx) {
    const [row] = await dbOf(tx).$queryRaw<{ credits: number }[]>`
      SELECT COALESCE(SUM(oi.quantity * p.credit_quantity), 0)::int AS credits
      FROM order_items oi JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ${orderId}::uuid`;
    return row?.credits ?? 0;
  }

  async findExpirable(createdBefore: Date, limit: number) {
    const rows = await prisma.order.findMany({
      where: { status: { in: ["pending_payment", "failed"] }, createdAt: { lt: createdBefore } },
      select: { id: true },
      take: limit,
    });
    return rows.map((r) => r.id);
  }

  async cancelIfUnpaid(id: string) {
    const { count } = await prisma.order.updateMany({
      where: { id, status: { in: ["pending_payment", "failed"] } },
      data: { status: "canceled" },
    });
    return count === 1;
  }
}
