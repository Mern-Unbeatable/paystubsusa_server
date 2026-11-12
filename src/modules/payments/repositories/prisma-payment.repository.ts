import type { PaymentStatus } from "../../../generated/prisma/enums.ts";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { dbOf, prisma } from "../../../shared/db/prisma.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import { skipTake, type PageRequest } from "../../../shared/http/pagination.ts";
import type { PaymentListFilter, PaymentRepository, PaymentScope, PaymentWithOwner } from "./payment.repository.ts";

const ownerInclude = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      userId: true,
      email: true,
      status: true,
      items: { select: { name: true, quantity: true, productCode: true } },
    },
  },
  subscription: { select: { id: true, userId: true, product: { select: { name: true } } } },
} as const;

type Raw = Prisma.PaymentGetPayload<{ include: typeof ownerInclude }>;
const toOwned = ({ subscription, ...p }: Raw): PaymentWithOwner => ({
  ...p,
  subscription: subscription ? { id: subscription.id, userId: subscription.userId, productName: subscription.product.name } : null,
});

function scopeWhere(scope: PaymentScope): Prisma.PaymentWhereInput {
  if (scope.kind === "admin") return {};
  if (scope.kind === "email") return { order: { email: scope.email } };
  return { OR: [{ order: { userId: scope.userId } }, { subscription: { userId: scope.userId } }] };
}

export class PrismaPaymentRepository implements PaymentRepository {
  upsertIntent(
    input: {
      orderId: string;
      providerPaymentId: string;
      amountCents: number;
      currency: string;
      status: PaymentStatus;
      cardBrand?: string | null;
      cardLast4?: string | null;
      receiptUrl?: string | null;
      failureCode?: string | null;
    },
    tx?: Tx,
  ) {
    const { orderId, providerPaymentId, ...rest } = input;
    return dbOf(tx).payment.upsert({
      where: { provider_providerPaymentId: { provider: "stripe", providerPaymentId } },
      create: { orderId, providerPaymentId, provider: "stripe", ...rest },
      update: rest,
    });
  }

  upsertInvoice(
    input: {
      subscriptionId: string;
      providerPaymentId: string;
      amountCents: number;
      currency: string;
      status: PaymentStatus;
      receiptUrl?: string | null;
      cardBrand?: string | null;
      cardLast4?: string | null;
    },
    tx?: Tx,
  ) {
    const { subscriptionId, providerPaymentId, ...rest } = input;
    return dbOf(tx).payment.upsert({
      where: { provider_providerPaymentId: { provider: "stripe", providerPaymentId } },
      create: { subscriptionId, providerPaymentId, provider: "stripe", ...rest },
      update: rest,
    });
  }

  findByProviderId(providerPaymentId: string, tx?: Tx) {
    return dbOf(tx).payment.findUnique({
      where: { provider_providerPaymentId: { provider: "stripe", providerPaymentId } },
    });
  }

  async updateRefund(id: string, amountRefundedCents: number, status: PaymentStatus, tx: Tx) {
    await dbOf(tx).payment.update({ where: { id }, data: { amountRefundedCents, status } });
  }

  listForOrder(orderId: string) {
    return prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
  }

  async findWithOwner(id: string) {
    const row = await prisma.payment.findUnique({ where: { id }, include: ownerInclude });
    return row ? toOwned(row) : null;
  }

  async list(scope: PaymentScope, filter: PaymentListFilter, page: PageRequest) {
    const q = filter.q?.trim();
    const where: Prisma.PaymentWhereInput = {
      AND: [
        scopeWhere(scope),
        filter.status ? { status: filter.status } : {},
        { createdAt: { gte: filter.from, lte: filter.to } },
        q
          ? {
              OR: [
                { providerPaymentId: { contains: q } },
                { order: { orderNumber: { contains: q, mode: "insensitive" } } },
                { order: { email: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.payment.findMany({ where, include: ownerInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...skipTake(page) }),
      prisma.payment.count({ where }),
    ]);
    return { items: rows.map(toOwned), total };
  }
}
