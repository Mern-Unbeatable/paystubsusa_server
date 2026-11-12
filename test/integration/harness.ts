import Stripe from "stripe";
import request from "supertest";
import { createApp } from "../../src/app.ts";
import { createContainer } from "../../src/container.ts";
import { env } from "../../src/config/env.ts";
import { prisma } from "../../src/shared/db/prisma.ts";
import { JobRunner } from "../../src/shared/jobs/job-runner.ts";
import { StripeGateway, type PaymentGateway } from "../../src/integrations/stripe.ts";
import type { Mailer, OutgoingEmail } from "../../src/integrations/mailer.ts";
import type { DocumentRenderer, RenderPayload } from "../../src/integrations/renderer.ts";
import { renderDocumentJob } from "../../src/jobs/renderDocument.job.ts";
import { sendEmailJob } from "../../src/jobs/sendEmail.job.ts";
import { assertTestDatabase } from "./global-setup.ts";

/** Stripe stand-in: no network. Webhook signatures are verified by the real Stripe library. */
export class FakeGateway implements PaymentGateway {
  private n = 0;
  private readonly real = new StripeGateway();
  readonly intents = new Map<string, { orderId: string; amountCents: number }>();
  readonly refunds: { paymentIntentId: string; amountCents: number | null }[] = [];

  async createPaymentIntent(input: Parameters<PaymentGateway["createPaymentIntent"]>[0]) {
    const id = `pi_test_${++this.n}`;
    this.intents.set(id, { orderId: input.orderId, amountCents: input.amountCents });
    return { id, clientSecret: `${id}_secret_test` };
  }
  async getClientSecret(id: string) {
    return `${id}_secret_test`;
  }
  async retrievePaymentIntent(id: string) {
    const intent = this.intents.get(id);
    return {
      id,
      status: "requires_payment_method",
      amount: intent?.amountCents ?? 0,
      amount_received: 0,
      currency: "usd",
      metadata: { orderId: intent?.orderId ?? "" },
    } as unknown as Stripe.PaymentIntent;
  }
  async cancelPaymentIntent() {
    return true;
  }
  async getCardDetails() {
    return { cardBrand: "visa", cardLast4: "4242", receiptUrl: "https://pay.stripe.com/receipts/test" };
  }
  async getInvoiceCardDetails() {
    return { cardBrand: "visa", cardLast4: "4242", receiptUrl: null };
  }
  async createRefund(input: Parameters<PaymentGateway["createRefund"]>[0]) {
    this.refunds.push({ paymentIntentId: input.paymentIntentId, amountCents: input.amountCents });
    return { id: `re_test_${++this.n}`, status: "pending" };
  }
  async createCustomer() {
    return `cus_test_${++this.n}`;
  }
  async createSubscriptionCheckout() {
    return "cs_test_secret_test";
  }
  async createPortalSession() {
    return "https://billing.stripe.com/test";
  }
  cancelSubscription(): never {
    throw new Error("not used");
  }
  retrieveSubscription(): never {
    throw new Error("not used");
  }
  async listCustomerSubscriptions() {
    return [];
  }
  async listSubscriptionInvoices() {
    return [];
  }
  async createPrice() {
    return `price_test_${++this.n}`;
  }
  constructEvent(rawBody: Buffer, signature: string) {
    return this.real.constructEvent(rawBody, signature);
  }
}

export class MemoryMailer implements Mailer {
  readonly sent: OutgoingEmail[] = [];
  async send(email: OutgoingEmail) {
    this.sent.push(email);
    return { providerMessageId: `mem:${this.sent.length}` };
  }
  lastCodeFor(to: string) {
    const mail = [...this.sent].reverse().find((m) => m.to === to && /\b\d{6}\b/.test(m.subject + m.text));
    return (mail?.subject + " " + mail?.text).match(/\b(\d{6})\b/)?.[1];
  }
}

export class FakeRenderer implements DocumentRenderer {
  readonly calls: RenderPayload[] = [];
  async render(payload: RenderPayload) {
    this.calls.push(payload);
    return Buffer.from("%PDF-1.4\n% fake test document\n");
  }
  async close() {}
}

export function createHarness() {
  const gateway = new FakeGateway();
  const mailer = new MemoryMailer();
  const renderer = new FakeRenderer();
  const container = createContainer({ gateway, mailer, renderer });
  const app = createApp(container);
  const runner = new JobRunner(
    container.repositories.jobs,
    { "render-document": renderDocumentJob(container.services.documents), "send-email": sendEmailJob(container.services.notifications) },
    { concurrency: 4, pollIntervalMs: 60_000 },
  );

  /** Runs queued jobs until none are due. */
  const drainJobs = async () => {
    for (let i = 0; i < 10; i++) {
      await runner.poll();
      if ((await container.repositories.jobs.countPending()) === 0) return;
    }
  };

  const webhook = (event: { id: string; type: string; data: { object: unknown } }) => {
    const payload = JSON.stringify({ object: "event", api_version: "2026-10-28.endive", created: Math.floor(Date.now() / 1000), livemode: false, ...event });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_WEBHOOK_SECRET });
    return request(app).post("/api/v1/webhooks/stripe").set("Content-Type", "application/json").set("Stripe-Signature", signature).send(payload);
  };

  /** Full guest verification: request a code, read it from the captured email, exchange it. */
  const guestToken = async (email: string, purpose: "checkout" | "document_access" = "checkout") => {
    const sent = await request(app).post("/api/v1/verifications").send({ email, purpose }).expect(202);
    await drainJobs();
    const code = mailer.lastCodeFor(email);
    if (!code) throw new Error("no code email captured");
    const verified = await request(app).post(`/api/v1/verifications/${sent.body.data.challengeId}/verify`).send({ code }).expect(200);
    return verified.body.data.guestToken as string;
  };

  return { app, container, gateway, mailer, renderer, drainJobs, webhook, guestToken };
}

/** Clears everything except the seeded catalog. */
export async function resetDatabase() {
  assertTestDatabase(env.DATABASE_URL);
  await prisma.$executeRawUnsafe(`
    TRUNCATE audit_logs, email_deliveries, jobs, idempotency_keys, rate_limit_counters, webhook_events,
      contact_messages, payments, documents, entitlements, order_items, orders, subscriptions,
      verification_challenges, refresh_sessions, users RESTART IDENTITY CASCADE`);
}

export const paymentIntentEvent = (type: "payment_intent.succeeded" | "payment_intent.payment_failed", pi: { id: string; orderId: string; amount: number; currency?: string }) => ({
  id: `evt_${pi.id}_${type}_${Math.random().toString(36).slice(2, 8)}`,
  type,
  data: {
    object: {
      id: pi.id,
      object: "payment_intent",
      amount: pi.amount,
      amount_received: type === "payment_intent.succeeded" ? pi.amount : 0,
      currency: pi.currency ?? "usd",
      metadata: { orderId: pi.orderId },
      last_payment_error: type === "payment_intent.payment_failed" ? { code: "card_declined" } : null,
    },
  },
});
