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

export interface GatewayInvoice {
  id: string;
  status: Stripe.Invoice.Status | null;
  amountPaid: number;
  amountDue: number;
  currency: string;
  hostedInvoiceUrl: string | null;
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
  retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent>;
  /** Best effort; returns false if Stripe refuses (e.g. it already succeeded). */
  cancelPaymentIntent(paymentIntentId: string): Promise<boolean>;
  getCardDetails(paymentIntentId: string): Promise<CardDetails>;
  /** Card of the payment that settled an invoice; null when it wasn't paid by a PaymentIntent. */
  getInvoiceCardDetails(invoiceId: string): Promise<CardDetails | null>;
  createRefund(input: {
    paymentIntentId: string;
    amountCents: number | null;
    idempotencyKey: string;
    orderId: string;
  }): Promise<{ id: string; status: string | null }>;
  createCustomer(input: { userId: string; email: string; name: string }): Promise<string>;
  /** Checkout Session for the Payment Element (ui_mode "elements"); resolves to its client secret. */
  createSubscriptionCheckout(input: {
    customerId: string;
    priceId: string;
    userId: string;
    returnUrl: string;
  }): Promise<string>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string>;
  cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<GatewaySubscription>;
  retrieveSubscription(subscriptionId: string): Promise<GatewaySubscription>;
  /** Webhook fallback: every subscription of one Stripe customer, newest first. */
  listCustomerSubscriptions(customerId: string): Promise<GatewaySubscription[]>;
  listSubscriptionInvoices(subscriptionId: string): Promise<GatewayInvoice[]>;
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
    // The Customer Portal schedules period-end cancels via cancel_at and leaves cancel_at_period_end false.
    cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
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
        excluded_payment_method_types: ["cashapp", "amazon_pay"],
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

  retrievePaymentIntent(paymentIntentId: string) {
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
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

  async getInvoiceCardDetails(invoiceId: string) {
    const page = await this.stripe.invoicePayments.list({ invoice: invoiceId, status: "paid", limit: 1 });
    const paymentIntentId = idOf(page.data[0]?.payment.payment_intent);
    return paymentIntentId ? this.getCardDetails(paymentIntentId) : null;
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
      // Payment Element in our own dialog; only redirect-based methods come back via return_url.
      ui_mode: "elements",
      return_url: input.returnUrl,
      excluded_payment_method_types: ["cashapp", "amazon_pay"],
      customer: input.customerId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      client_reference_id: input.userId,
      metadata: { userId: input.userId },
      subscription_data: { metadata: { userId: input.userId } },
    });
    if (!session.client_secret) throw new Error("Stripe returned no checkout client secret");
    return session.client_secret;
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

  async listCustomerSubscriptions(customerId: string) {
    const page = await this.stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    return page.data.map(normalizeSubscription);
  }

  async listSubscriptionInvoices(subscriptionId: string) {
    const page = await this.stripe.invoices.list({ subscription: subscriptionId, limit: 24 });
    return page.data
      .filter((i): i is Stripe.Invoice & { id: string } => Boolean(i.id))
      .map((i) => ({
        id: i.id,
        status: i.status,
        amountPaid: i.amount_paid,
        amountDue: i.amount_due,
        currency: i.currency,
        hostedInvoiceUrl: i.hosted_invoice_url ?? null,
      }));
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
