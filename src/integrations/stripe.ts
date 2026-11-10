import Stripe from "stripe";
import { env } from "../config/env.ts";

export type StripeEvent = Stripe.Event;

export interface CardDetails {
  cardBrand: string | null;
  cardLast4: string | null;
  receiptUrl: string | null;
}

export interface GatewaySubscription {
  id: string;
  customerId: string;
  status: Stripe.Subscription.Status;
  priceId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  metadataUserId: string | null;
}

/** Everything the app needs from Stripe; tests substitute a fake. */
export interface PaymentGateway {
  createPaymentIntent(input: {
    orderId: string;
    amountCents: number;
    currency: string;
    customerId: string | null;
    idempotencyKey: string;
  }): Promise<{ id: string; clientSecret: string }>;
  getClientSecret(paymentIntentId: string): Promise<string>;
  /** Best effort; returns false if Stripe refuses (e.g. it already succeeded). */
  cancelPaymentIntent(paymentIntentId: string): Promise<boolean>;
  getCardDetails(paymentIntentId: string): Promise<CardDetails>;
  createRefund(input: {
    paymentIntentId: string;
    amountCents: number | null;
    idempotencyKey: string;
    orderId: string;
  }): Promise<{ id: string; status: string | null }>;
  createCustomer(input: { userId: string; email: string; name: string }): Promise<string>;
  createSubscriptionCheckout(input: {
    customerId: string;
    priceId: string;
    userId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string>;
  cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<GatewaySubscription>;
  retrieveSubscription(subscriptionId: string): Promise<GatewaySubscription>;
  createPrice(input: {
    previousPriceId: string | null;
    productName: string;
    amountCents: number;
    currency: string;
    interval: "month" | null;
  }): Promise<string>;
  constructEvent(rawBody: Buffer, signature: string): StripeEvent;
}

const toDate = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);
const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

export function normalizeSubscription(sub: Stripe.Subscription): GatewaySubscription {
  const item = sub.items.data[0];
  return {
    id: sub.id,
    customerId: idOf(sub.customer) ?? "",
    status: sub.status,
    priceId: item?.price.id ?? null,
    currentPeriodStart: toDate(item?.current_period_start),
    currentPeriodEnd: toDate(item?.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    canceledAt: toDate(sub.canceled_at),
    metadataUserId: sub.metadata?.["userId"] ?? null,
  };
}

export class StripeGateway implements PaymentGateway {
  private readonly stripe = new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20_000 });

  async createPaymentIntent(input: Parameters<PaymentGateway["createPaymentIntent"]>[0]) {
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: input.currency,
        customer: input.customerId ?? undefined,
        automatic_payment_methods: { enabled: true },
        metadata: { orderId: input.orderId },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!pi.client_secret) throw new Error("Stripe returned no client secret");
    return { id: pi.id, clientSecret: pi.client_secret };
  }

  async getClientSecret(paymentIntentId: string) {
    const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    if (!pi.client_secret) throw new Error("Stripe returned no client secret");
    return pi.client_secret;
  }

  async cancelPaymentIntent(paymentIntentId: string) {
    try {
      await this.stripe.paymentIntents.cancel(paymentIntentId);
      return true;
    } catch (err) {
      if (err instanceof Stripe.errors.StripeInvalidRequestError) return false;
      throw err;
    }
  }

  async getCardDetails(paymentIntentId: string): Promise<CardDetails> {
    const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    const card = charge?.payment_method_details?.card;
    return { cardBrand: card?.brand ?? null, cardLast4: card?.last4 ?? null, receiptUrl: charge?.receipt_url ?? null };
  }

  async createRefund(input: Parameters<PaymentGateway["createRefund"]>[0]) {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: input.paymentIntentId,
        amount: input.amountCents ?? undefined,
        metadata: { orderId: input.orderId },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { id: refund.id, status: refund.status };
  }

  async createCustomer(input: { userId: string; email: string; name: string }) {
    const customer = await this.stripe.customers.create(
      { email: input.email, name: input.name, metadata: { userId: input.userId } },
      { idempotencyKey: `customer:${input.userId}` },
    );
    return customer.id;
  }

  async createSubscriptionCheckout(input: Parameters<PaymentGateway["createSubscriptionCheckout"]>[0]) {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.userId,
      metadata: { userId: input.userId },
      subscription_data: { metadata: { userId: input.userId } },
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    return session.url;
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return session.url;
  }

  async cancelSubscription(subscriptionId: string, atPeriodEnd: boolean) {
    const sub = atPeriodEnd
      ? await this.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })
      : await this.stripe.subscriptions.cancel(subscriptionId);
    return normalizeSubscription(sub);
  }

  async retrieveSubscription(subscriptionId: string) {
    return normalizeSubscription(await this.stripe.subscriptions.retrieve(subscriptionId));
  }

  async createPrice(input: Parameters<PaymentGateway["createPrice"]>[0]) {
    const product = input.previousPriceId
      ? idOf((await this.stripe.prices.retrieve(input.previousPriceId)).product)
      : null;
    const price = await this.stripe.prices.create({
      unit_amount: input.amountCents,
      currency: input.currency,
      ...(product ? { product } : { product_data: { name: input.productName } }),
      ...(input.interval ? { recurring: { interval: input.interval } } : {}),
    });
    return price.id;
  }

  constructEvent(rawBody: Buffer, signature: string) {
    return this.stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET, 300);
  }
}
