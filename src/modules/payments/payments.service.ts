import { conflict, notFound, validation } from "../../shared/http/app-error.ts";
import { toPage, type PageRequest } from "../../shared/http/pagination.ts";
import { canAccessOrder, DOWNLOADABLE_ORDER_STATUSES, scopeOf } from "../../shared/policies/access.ts";
import type { Principal } from "../../shared/types.ts";
import type { PaymentGateway } from "../../integrations/stripe.ts";
import type { PaymentListFilter, PaymentRepository, PaymentWithOwner } from "./repositories/payment.repository.ts";

/** "3 Paystubs + 2 additional" style summary, as the dashboards show it. */
export function describeItems(items: { name: string; quantity: number; productCode: string }[]) {
  return items
    .map((i) => (i.productCode === "paystub_additional" ? `${i.quantity} additional` : i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name))
    .join(" + ");
}

const describe = (p: PaymentWithOwner) =>
  p.order ? describeItems(p.order.items) : p.subscription ? `${p.subscription.productName} (subscription)` : "Payment";

export const toPaymentDto = (p: PaymentWithOwner) => ({
  id: p.id,
  orderId: p.orderId,
  orderNumber: p.order?.orderNumber ?? null,
  subscriptionId: p.subscriptionId,
  description: describe(p),
  amountCents: p.amountCents,
  amountRefundedCents: p.amountRefundedCents,
  currency: p.currency,
  status: p.status,
  cardBrand: p.cardBrand,
  cardLast4: p.cardLast4,
  receiptUrl: p.receiptUrl,
  createdAt: p.createdAt,
});

const toAdminPaymentDto = (p: PaymentWithOwner) => ({
  ...toPaymentDto(p),
  provider: p.provider,
  providerPaymentId: p.providerPaymentId,
  failureCode: p.failureCode,
  email: p.order?.email ?? null,
  userId: p.order?.userId ?? p.subscription?.userId ?? null,
});

function canAccessPayment(principal: Principal, p: PaymentWithOwner) {
  if (p.order) return canAccessOrder(principal, p.order);
  return principal.type === "user" && (principal.role === "admin" || p.subscription?.userId === principal.userId);
}

export class PaymentsService {
  private readonly payments: PaymentRepository;
  private readonly gateway: PaymentGateway;

  constructor(payments: PaymentRepository, gateway: PaymentGateway) {
    this.payments = payments;
    this.gateway = gateway;
  }

  /**
   * Returns the client secret for the order's PaymentIntent, creating it on first call.
   * The Stripe idempotency key makes a retried call return the same PaymentIntent.
   */
  async ensureIntent(order: { id: string; totalCents: number; currency: string }, customerId: string | null) {
    const open = (await this.payments.listForOrder(order.id)).find((p) => p.status === "requires_payment" || p.status === "failed");
    if (open) return this.gateway.getClientSecret(open.providerPaymentId);

    const intent = await this.gateway.createPaymentIntent({
      orderId: order.id,
      amountCents: order.totalCents,
      currency: order.currency,
      customerId,
      idempotencyKey: `order:${order.id}:intent:1`,
    });
    await this.payments.upsertIntent({
      orderId: order.id,
      providerPaymentId: intent.id,
      amountCents: order.totalCents,
      currency: order.currency,
      status: "requires_payment",
    });
    return intent.clientSecret;
  }

  /** Expiry job: cancel unpaid PaymentIntents so a stale checkout can't be paid later. */
  async cancelOpenIntents(orderId: string) {
    let allCanceled = true;
    for (const p of await this.payments.listForOrder(orderId)) {
      if (p.status === "requires_payment" || p.status === "failed" || p.status === "processing") {
        allCanceled = (await this.gateway.cancelPaymentIntent(p.providerPaymentId)) && allCanceled;
      }
    }
    return allCanceled;
  }

  listForOrder(orderId: string) {
    return this.payments.listForOrder(orderId);
  }

  async list(principal: Principal, filter: PaymentListFilter, page: PageRequest) {
    const scope = scopeOf(principal);
    const { items, total } = await this.payments.list(scope, filter, page);
    return toPage(items.map(scope.kind === "admin" ? toAdminPaymentDto : toPaymentDto), total, page);
  }

  async get(principal: Principal, id: string) {
    const p = await this.payments.findWithOwner(id);
    if (!p || !canAccessPayment(principal, p)) throw notFound("PAYMENT_NOT_FOUND", "Payment not found");
    return scopeOf(principal).kind === "admin" ? toAdminPaymentDto(p) : toPaymentDto(p);
  }

  /**
   * Admin refund through Stripe. The final payment/order state is set by the
   * `charge.refunded` webhook, not here.
   */
  async requestRefund(
    order: { id: string; status: string },
    amountCents: number | null,
    idempotencyKey: string,
  ) {
    if (!DOWNLOADABLE_ORDER_STATUSES.includes(order.status as never)) {
      throw conflict("ORDER_NOT_REFUNDABLE", "Only paid orders can be refunded");
    }
    const payment = (await this.payments.listForOrder(order.id)).find((p) => p.status === "succeeded" || p.status === "partially_refunded");
    if (!payment) throw conflict("ORDER_NOT_REFUNDABLE", "This order has no captured payment to refund");
    const refundable = payment.amountCents - payment.amountRefundedCents;
    if (amountCents !== null && amountCents > refundable) {
      throw validation({ amountCents: [`At most ${refundable} cents can be refunded`] });
    }
    const refund = await this.gateway.createRefund({
      paymentIntentId: payment.providerPaymentId,
      amountCents,
      idempotencyKey: `refund:${idempotencyKey}`,
      orderId: order.id,
    });
    return { refundId: refund.id, status: refund.status, paymentId: payment.id, amountCents: amountCents ?? refundable };
  }
}
