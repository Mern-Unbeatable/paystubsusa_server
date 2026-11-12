import type Stripe from "stripe";
import { badRequest } from "../../shared/http/app-error.ts";
import type { TransactionManager, Tx } from "../../shared/db/transaction.ts";
import { logger } from "../../shared/logger.ts";
import type { GatewaySubscription, PaymentGateway, StripeEvent } from "../../integrations/stripe.ts";
import type { OrdersService } from "../orders/index.ts";
import type { SubscriptionsService } from "../subscriptions/index.ts";
import type { PaymentRepository } from "./repositories/payment.repository.ts";
import type { WebhookEventRepository } from "./repositories/webhook-event.repository.ts";

interface Deps {
  gateway: PaymentGateway;
  tx: TransactionManager;
  events: WebhookEventRepository;
  payments: PaymentRepository;
  orders: OrdersService;
  subscriptions: SubscriptionsService;
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

/** Network data fetched before the transaction so no Stripe call holds row locks. */
interface Prefetched {
  card?: { cardBrand: string | null; cardLast4: string | null; receiptUrl: string | null };
  subscription?: GatewaySubscription;
}

export class WebhookService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  /** Throws 400 on a bad signature; any other throw becomes a 500 so Stripe retries. */
  async handle(rawBody: Buffer, signature: string | undefined) {
    let event: StripeEvent;
    try {
      if (!signature) throw new Error("missing signature");
      event = this.d.gateway.constructEvent(rawBody, signature);
    } catch {
      throw badRequest("WEBHOOK_SIGNATURE_INVALID", "Invalid webhook signature");
    }

    if (!(await this.d.events.begin(event.id, event.type, event))) return { duplicate: true };

    try {
      const pre = await this.prefetch(event);
      await this.d.tx.run(async (tx) => {
        await this.dispatch(event, pre, tx);
        await this.d.events.markProcessed(event.id, tx);
      });
    } catch (err) {
      logger.error({ err, eventId: event.id, type: event.type }, "Webhook processing failed");
      await this.d.events.markError(event.id, err instanceof Error ? err.message : String(err)).catch(() => {});
      throw err;
    }
    return { duplicate: false };
  }

  /**
   * Fallback when the webhook is missed or late: asks Stripe directly whether an open PaymentIntent
   * succeeded and, if so, runs the same verified fulfilment. Returns true when it fulfilled or found it paid.
   */
  async reconcileOrder(orderId: string): Promise<boolean> {
    try {
      for (const p of await this.d.payments.listForOrder(orderId)) {
        if (p.status !== "requires_payment" && p.status !== "processing" && p.status !== "failed") continue;
        const pi = await this.d.gateway.retrievePaymentIntent(p.providerPaymentId);
        if (pi.status !== "succeeded" || pi.metadata?.["orderId"] !== orderId) continue;
        const pre = { card: await this.d.gateway.getCardDetails(pi.id) };
        await this.d.tx.run((tx) => this.paymentSucceeded(pi, pre, tx));
        return true;
      }
    } catch (err) {
      logger.warn({ err, orderId }, "Payment reconciliation failed");
    }
    return false;
  }

  private async prefetch(event: StripeEvent): Promise<Prefetched> {
    switch (event.type) {
      case "payment_intent.succeeded":
        return { card: await this.d.gateway.getCardDetails(event.data.object.id) };
      case "checkout.session.completed": {
        const subId = idOf(event.data.object.subscription);
        return subId ? { subscription: await this.d.gateway.retrieveSubscription(subId) } : {};
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        // Re-read the current state: events can arrive out of order.
        return { subscription: await this.d.gateway.retrieveSubscription(event.data.object.id) };
      case "invoice.paid":
      case "invoice.payment_failed": {
        const subId = idOf(event.data.object.parent?.subscription_details?.subscription);
        return subId ? { subscription: await this.d.gateway.retrieveSubscription(subId) } : {};
      }
      default:
        return {};
    }
  }

  private async dispatch(event: StripeEvent, pre: Prefetched, tx: Tx) {
    switch (event.type) {
      case "payment_intent.succeeded":
        return this.paymentSucceeded(event.data.object, pre, tx);
      case "payment_intent.payment_failed":
        return this.paymentFailed(event.data.object, tx);
      case "charge.refunded":
        return this.chargeRefunded(event.data.object, tx);
      case "checkout.session.completed":
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        if (pre.subscription) await this.d.subscriptions.syncFromGateway(pre.subscription, tx);
        return;
      case "invoice.paid":
      case "invoice.payment_failed":
        return this.invoice(event.data.object, event.type === "invoice.paid", pre, tx);
      default:
        logger.debug({ type: event.type }, "Unhandled webhook event");
    }
  }

  private async paymentSucceeded(pi: Stripe.PaymentIntent, pre: Prefetched, tx: Tx) {
    const orderId = pi.metadata?.["orderId"];
    if (!orderId) return;
    const order = await this.d.orders.lockForUpdate(orderId, tx);
    if (!order) {
      logger.warn({ paymentIntentId: pi.id }, "PaymentIntent for unknown order");
      return;
    }
    const received = { amountCents: pi.amount_received, currency: pi.currency };
    await this.d.payments.upsertIntent(
      { orderId, providerPaymentId: pi.id, ...received, status: "succeeded", failureCode: null, ...pre.card },
      tx,
    );
    if (order.status === "paid" || order.status === "refunded" || order.status === "partially_refunded") return;

    // Never trust the client: the captured amount must match the server-side total.
    if (received.amountCents !== order.totalCents || received.currency !== order.currency) {
      return this.d.orders.flagAmountMismatch(order, received, tx);
    }
    await this.d.orders.fulfill(order, tx);
  }

  private async paymentFailed(pi: Stripe.PaymentIntent, tx: Tx) {
    const orderId = pi.metadata?.["orderId"];
    if (!orderId) return;
    const order = await this.d.orders.lockForUpdate(orderId, tx);
    if (!order) return;
    await this.d.payments.upsertIntent(
      { orderId, providerPaymentId: pi.id, amountCents: pi.amount, currency: pi.currency, status: "failed", failureCode: pi.last_payment_error?.code ?? null },
      tx,
    );
    await this.d.orders.markFailed(order, tx, pi.last_payment_error?.code ?? "payment_failed");
  }

  private async chargeRefunded(charge: Stripe.Charge, tx: Tx) {
    const piId = idOf(charge.payment_intent);
    if (!piId) return;
    const payment = await this.d.payments.findByProviderId(piId, tx);
    if (!payment) return;
    const full = charge.amount_refunded >= payment.amountCents;
    await this.d.payments.updateRefund(payment.id, charge.amount_refunded, full ? "refunded" : "partially_refunded", tx);
    if (!payment.orderId) return;
    const order = await this.d.orders.lockForUpdate(payment.orderId, tx);
    if (order) await this.d.orders.applyRefund(order, full, charge.amount_refunded, tx);
  }

  private async invoice(invoice: Stripe.Invoice, paid: boolean, pre: Prefetched, tx: Tx) {
    if (!pre.subscription || !invoice.id) return;
    const sub = await this.d.subscriptions.syncFromGateway(pre.subscription, tx);
    if (!sub) return;
    await this.d.payments.upsertInvoice(
      {
        subscriptionId: sub.id,
        providerPaymentId: invoice.id,
        amountCents: paid ? invoice.amount_paid : invoice.amount_due,
        currency: invoice.currency,
        status: paid ? "succeeded" : "failed",
      },
      tx,
    );
  }
}
