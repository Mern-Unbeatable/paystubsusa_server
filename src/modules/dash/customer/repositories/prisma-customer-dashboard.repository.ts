import { prisma } from "../../../../shared/db/prisma.ts";
import { DOWNLOADABLE_ORDER_STATUSES } from "../../../../shared/policies/access.ts";
import type { CustomerDashboardRepository } from "./customer-dashboard.repository.ts";

export class PrismaCustomerDashboardRepository implements CustomerDashboardRepository {
  async stats(userId: string) {
    const visible = { status: { not: "revoked" as const }, order: { userId, status: { in: [...DOWNLOADABLE_ORDER_STATUSES] } } };
    const [totalDocuments, paystubDocuments, successfulPayments] = await Promise.all([
      prisma.document.count({ where: visible }),
      prisma.document.count({ where: { ...visible, type: "paystub" } }),
      prisma.payment.count({
        where: {
          status: { in: ["succeeded", "partially_refunded"] },
          OR: [{ order: { userId } }, { subscription: { userId } }],
        },
      }),
    ]);
    return { totalDocuments, paystubDocuments, successfulPayments };
  }
}
