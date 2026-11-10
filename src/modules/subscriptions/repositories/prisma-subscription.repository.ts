import type { SubscriptionStatus } from "../../../generated/prisma/enums.ts";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { dbOf, prisma } from "../../../shared/db/prisma.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import { skipTake, type PageRequest } from "../../../shared/http/pagination.ts";
import type { SubscriptionRepository, SubscriptionRow, SubscriptionUpsert } from "./subscription.repository.ts";

const detailInclude = {
  user: { select: { id: true, name: true, email: true } },
  product: { select: { code: true, name: true, amountCents: true, currency: true, interval: true } },
} as const;

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  upsert(input: SubscriptionUpsert, tx?: Tx) {
    const { stripeSubscriptionId, ...rest } = input;
    return dbOf(tx).subscription.upsert({
      where: { stripeSubscriptionId },
      create: input,
      update: rest,
    });
  }

  findByStripeId(stripeSubscriptionId: string, tx?: Tx) {
    return dbOf(tx).subscription.findUnique({ where: { stripeSubscriptionId } });
  }

  findActiveForUser(userId: string) {
    return prisma.subscription.findFirst({
      where: { userId, status: { in: ["active", "past_due"] } },
      orderBy: { createdAt: "desc" },
    });
  }

  latestForUser(userId: string) {
    return prisma.subscription.findFirst({ where: { userId }, include: detailInclude, orderBy: { createdAt: "desc" } });
  }

  findDetail(id: string) {
    return prisma.subscription.findUnique({ where: { id }, include: detailInclude });
  }

  async list(filter: { status?: SubscriptionStatus; q?: string }, page: PageRequest) {
    const q = filter.q?.trim();
    const where: Prisma.SubscriptionWhereInput = {
      status: filter.status,
      ...(q
        ? {
            OR: [
              { user: { email: { contains: q, mode: "insensitive" } } },
              { user: { name: { contains: q, mode: "insensitive" } } },
              { stripeSubscriptionId: { contains: q } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.subscription.findMany({ where, include: detailInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...skipTake(page) }),
      prisma.subscription.count({ where }),
    ]);
    return { items, total };
  }

  documentsGenerated(sub: SubscriptionRow) {
    return prisma.document.count({
      where: {
        createdAt: { gte: sub.createdAt, ...(sub.canceledAt ? { lte: sub.canceledAt } : {}) },
        order: { userId: sub.userId, items: { some: { productId: sub.productId } } },
      },
    });
  }
}
