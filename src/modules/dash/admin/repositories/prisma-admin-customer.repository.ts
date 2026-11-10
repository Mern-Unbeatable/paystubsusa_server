import { Prisma } from "../../../../generated/prisma/client.ts";
import { prisma } from "../../../../shared/db/prisma.ts";
import { skipTake, type PageRequest } from "../../../../shared/http/pagination.ts";
import type { AdminCustomerFilter, AdminCustomerRepository, AdminCustomerRow } from "./admin-customer.repository.ts";

const columns = Prisma.sql`
  u.id, u.name, u.email, u.phone, u.status, u.email_verified_at AS "emailVerifiedAt",
  u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt",
  (SELECT count(*) FROM documents d JOIN orders o ON o.id = d.order_id
    WHERE o.user_id = u.id AND o.status IN ('paid', 'partially_refunded'))::int AS "documentCount",
  (SELECT COALESCE(SUM(p.amount_cents - p.amount_refunded_cents), 0) FROM payments p
    LEFT JOIN orders o ON o.id = p.order_id
    LEFT JOIN subscriptions s ON s.id = p.subscription_id
    WHERE (o.user_id = u.id OR s.user_id = u.id)
      AND p.status IN ('succeeded', 'partially_refunded', 'refunded'))::int AS "lifetimeSpendCents"`;

export class PrismaAdminCustomerRepository implements AdminCustomerRepository {
  async list(filter: AdminCustomerFilter, page: PageRequest) {
    const q = filter.q?.trim();
    const where = Prisma.sql`u.role = 'customer'
      ${filter.status ? Prisma.sql`AND u.status = ${filter.status}::"UserStatus"` : Prisma.empty}
      ${q ? Prisma.sql`AND (u.email ILIKE ${`%${q}%`} OR u.name ILIKE ${`%${q}%`})` : Prisma.empty}`;
    const order = filter.sort === "lifetimeSpend" ? Prisma.sql`"lifetimeSpendCents" DESC, u.id DESC` : Prisma.sql`u.created_at DESC, u.id DESC`;
    const { skip, take } = skipTake(page);
    const [items, [count]] = await Promise.all([
      prisma.$queryRaw<AdminCustomerRow[]>`SELECT ${columns} FROM users u WHERE ${where} ORDER BY ${order} LIMIT ${take} OFFSET ${skip}`,
      prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM users u WHERE ${where}`,
    ]);
    return { items, total: count?.total ?? 0 };
  }

  async find(id: string) {
    const [row] = await prisma.$queryRaw<AdminCustomerRow[]>`
      SELECT ${columns} FROM users u WHERE u.id = ${id}::uuid AND u.role = 'customer'`;
    return row ?? null;
  }
}
