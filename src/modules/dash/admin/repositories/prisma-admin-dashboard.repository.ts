import type { DocumentType } from "../../../../generated/prisma/enums.ts";
import { prisma } from "../../../../shared/db/prisma.ts";
import type { AdminDashboardRepository } from "./admin-dashboard.repository.ts";

const CAPTURED = ["succeeded", "partially_refunded", "refunded"] as const;

export class PrismaAdminDashboardRepository implements AdminDashboardRepository {
  async kpis(startOfToday: Date) {
    const [totalCustomers, totalDocuments, totalOrders, revenue, activeSubscriptions, generatedToday] = await Promise.all([
      prisma.user.count({ where: { role: "customer" } }),
      prisma.document.count({ where: { order: { status: { in: ["paid", "partially_refunded"] } } } }),
      prisma.order.count({ where: { status: { in: ["paid", "partially_refunded", "refunded"] } } }),
      prisma.payment.aggregate({ where: { status: { in: [...CAPTURED] } }, _sum: { amountCents: true, amountRefundedCents: true } }),
      prisma.subscription.count({ where: { status: { in: ["active", "past_due"] } } }),
      prisma.document.count({ where: { renderedAt: { gte: startOfToday } } }),
    ]);
    return {
      totalCustomers,
      totalDocuments,
      totalOrders,
      totalRevenueCents: (revenue._sum.amountCents ?? 0) - (revenue._sum.amountRefundedCents ?? 0),
      activeSubscriptions,
      generatedToday,
    };
  }

  revenueByMonth(months: number) {
    return prisma.$queryRaw<{ month: string; revenueCents: number }[]>`
      WITH m AS (
        SELECT generate_series(
          date_trunc('month', now() AT TIME ZONE 'utc') - make_interval(months => ${months - 1}::int),
          date_trunc('month', now() AT TIME ZONE 'utc'),
          interval '1 month') AS month
      )
      SELECT to_char(m.month, 'YYYY-MM') AS month,
             COALESCE(SUM(p.amount_cents - p.amount_refunded_cents), 0)::int AS "revenueCents"
      FROM m
      LEFT JOIN payments p
        ON date_trunc('month', p.created_at AT TIME ZONE 'utc') = m.month
       AND p.status IN ('succeeded', 'partially_refunded', 'refunded')
      GROUP BY m.month
      ORDER BY m.month`;
  }

  async documentsByType() {
    const rows = await prisma.document.groupBy({
      by: ["type"],
      where: { order: { status: { in: ["paid", "partially_refunded"] } } },
      _count: { _all: true },
    });
    return rows.map((r) => ({ type: r.type as DocumentType, count: r._count._all }));
  }
}
