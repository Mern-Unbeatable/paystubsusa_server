import type { PaymentStatus, SubscriptionStatus } from "../../generated/prisma/enums.ts";
import { env } from "../../config/env.ts";
import { AppError, conflict, notFound } from "../../shared/http/app-error.ts";
import { toPage, type PageRequest } from "../../shared/http/pagination.ts";
import type { TransactionManager, Tx } from "../../shared/db/transaction.ts";
import type { PaymentRepository } from "../payments/index.ts";
import type { Principal, RequestContext } from "../../shared/types.ts";
import { logger } from "../../shared/logger.ts";
import type { CardDetails, GatewayInvoice, GatewaySubscription, PaymentGateway } from "../../integrations/stripe.ts";
import { actorOf, type AuditService } from "../audit/index.ts";
import type { UserRepository } from "../auth/index.ts";
import type { CatalogService } from "../catalog/index.ts";
import type { SubscriptionDetail, SubscriptionRepository } from "./repositories/subscription.repository.ts";

export const SUBSCRIPTION_PRODUCT_CODE = "unlimited_monthly";

const STATUS_MAP: Record<GatewaySubscription["status"], SubscriptionStatus> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "unpaid",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  paused: "unpaid",
};

interface Deps {
  subscriptions: SubscriptionRepository;
  users: UserRepository;
  catalog: CatalogService;
  gateway: PaymentGateway;
  audit: AuditService;
  payments: Pick<PaymentRepository, "upsertInvoice" | "findByProviderId">;
  tx: TransactionManager;
}

// GET /me/subscription is polled; ask Stripe at most this often per user.
const RECONCILE_INTERVAL_MS = 10_000;
const INVOICE_STATUS = { paid: "succeeded", uncollectible: "failed" } as const;

const toAdminDto = (s: SubscriptionDetail, documentsGenerated: number) => ({
  id: s.id,
  userId: s.userId,
  customer: { id: s.user.id, name: s.user.name, email: s.user.email },
  planName: s.product.name,
  amountCents: s.product.amountCents,
  currency: s.product.currency,
  interval: s.product.interval,
  status: s.status,
  stripeSubscriptionId: s.stripeSubscriptionId,
  startDate: s.createdAt,
  currentPeriodStart: s.currentPeriodStart,
  currentPeriodEnd: s.currentPeriodEnd,
  cancelAtPeriodEnd: s.cancelAtPeriodEnd,
  canceledAt: s.canceledAt,
  documentsGenerated,
});

export class SubscriptionsService {
  private readonly d: Deps;
  // shortcut: per-instance throttle; a second instance may ask Stripe once more within the window.
  private readonly reconciledAt = new Map<string, number>();

  constructor(deps: Deps) {
    this.d = deps;
  }

  /**
   * Webhook fallback (missed, late or misrouted events): pulls this customer's subscriptions and
   * their invoices straight from Stripe and applies the same sync the webhook would.
   */
  async reconcile(userId: string, { force = false } = {}) {
    const last = this.reconciledAt.get(userId) ?? 0;
    if (!force && Date.now() - last < RECONCILE_INTERVAL_MS) return;
    this.reconciledAt.set(userId, Date.now());
    const user = await this.d.users.findById(userId);
    if (!user?.stripeCustomerId) return;
    try {
      const subs = await this.d.gateway.listCustomerSubscriptions(user.stripeCustomerId);
      for (const sub of subs) {
        if (sub.metadataUserId && sub.metadataUserId !== userId) continue;
        const invoices: (GatewayInvoice & { status: PaymentStatus; card: CardDetails | null })[] = [];
        for (const inv of await this.d.gateway.listSubscriptionInvoices(sub.id)) {
          const status = inv.status ? INVOICE_STATUS[inv.status as keyof typeof INVOICE_STATUS] : undefined;
          if (!status) continue;
          const needsCard = status === "succeeded" && !(await this.d.payments.findByProviderId(inv.id))?.cardLast4;
          const card = needsCard ? await this.d.gateway.getInvoiceCardDetails(inv.id) : null;
          invoices.push({ ...inv, status, card });
        }
        await this.d.tx.run(async (tx) => {
          const local = await this.syncFromGateway(sub, tx);
          if (!local) return;
          for (const inv of invoices) {
            const { status, card } = inv;
            await this.d.payments.upsertInvoice(
              {
                subscriptionId: local.id,
                providerPaymentId: inv.id,
                amountCents: status === "succeeded" ? inv.amountPaid : inv.amountDue,
                currency: inv.currency,
                status,
                receiptUrl: inv.hostedInvoiceUrl,
                ...(card ? { cardBrand: card.cardBrand, cardLast4: card.cardLast4 } : {}),
              },
              tx,
            );
          }
        });
      }
    } catch (err) {
      logger.warn({ err, userId }, "Subscription reconciliation with Stripe failed");
      if (force) throw err;
    }
  }

  /** Unlimited entitlement check; refreshes from Stripe first so a cancel without a webhook still ends access. */
  async activeFor(userId: string) {
    await this.reconcile(userId);
    return this.d.subscriptions.findActiveForUser(userId);
  }

  /** GET /me/subscription; null when the customer has never subscribed. */
  async getMine(userId: string) {
    await this.reconcile(userId);
    const s = await this.d.subscriptions.latestForUser(userId);
    if (!s) return null;
    return {
      planName: s.product.name,
      amountCents: s.product.amountCents,
      currency: s.product.currency,
      interval: s.product.interval,
      status: s.status,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      // Card details live in the Stripe Customer Portal; invoice payments don't carry them.
      cardBrand: null,
      cardLast4: null,
    };
  }

  private async ensureCustomer(userId: string) {
    const user = await this.d.users.findById(userId);
    if (!user) throw notFound();
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const created = await this.d.gateway.createCustomer({ userId: user.id, email: user.email, name: user.name });
    return this.d.users.setStripeCustomerId(user.id, created);
  }

  async createCheckoutSession(userId: string) {
    // Stripe may already hold a paid subscription whose webhook never arrived; never sell a second one.
    await this.reconcile(userId, { force: true });
    if (await this.d.subscriptions.findActiveForUser(userId)) {
      throw conflict("SUBSCRIPTION_ACTIVE", "You already have an active subscription");
    }
    const product = await this.d.catalog.findProduct(SUBSCRIPTION_PRODUCT_CODE);
    if (!product?.isActive || product.interval !== "month" || product.amountCents <= 0) {
      throw new AppError("SUBSCRIPTION_UNAVAILABLE", 503, "The Unlimited plan is not available right now");
    }
    const priceId = product.stripePriceId ?? (await this.provisionPrice(product));
    const customerId = await this.ensureCustomer(userId);
    const clientSecret = await this.d.gateway.createSubscriptionCheckout({
      customerId,
      priceId,
      userId,
      returnUrl: `${env.APP_URL}/customer/subscription?checkout=success`,
    });
    return { clientSecret };
  }

  /** First checkout without STRIPE_UNLIMITED_PRICE_ID: create the recurring Stripe price from the catalog amount. */
  private async provisionPrice(product: { code: string; name: string; amountCents: number; currency: string }) {
    const priceId = await this.d.gateway.createPrice({
      previousPriceId: null,
      productName: product.name,
      amountCents: product.amountCents,
      currency: product.currency,
      interval: "month",
    });
    await this.d.catalog.updateProduct(product.code, { stripePriceId: priceId });
    logger.info({ productCode: product.code }, "Created Stripe price for subscription product");
    return priceId;
  }

  async createPortalSession(userId: string) {
    const user = await this.d.users.findById(userId);
    if (!user?.stripeCustomerId) throw conflict("NO_BILLING_ACCOUNT", "You don't have a billing account yet");
    return { url: await this.d.gateway.createPortalSession({ customerId: user.stripeCustomerId, returnUrl: `${env.APP_URL}/customer/subscription` }) };
  }

  /** Webhook sync; Stripe is the source of truth for subscription state. */
  async syncFromGateway(sub: GatewaySubscription, tx: Tx) {
    const user =
      (sub.metadataUserId ? await this.d.users.findById(sub.metadataUserId, tx) : null) ??
      (sub.customerId ? await this.d.users.findByStripeCustomerId(sub.customerId) : null);
    if (!user) {
      logger.warn({ subscriptionId: sub.id }, "Subscription for unknown user; ignored");
      return null;
    }
    const product = await this.d.catalog.findProduct(SUBSCRIPTION_PRODUCT_CODE);
    if (!product) throw new Error("unlimited_monthly product is missing");
    return this.d.subscriptions.upsert(
      {
        userId: user.id,
        productId: product.id,
        stripeSubscriptionId: sub.id,
        status: STATUS_MAP[sub.status] ?? "incomplete",
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        canceledAt: sub.canceledAt,
      },
      tx,
    );
  }

  findByStripeId(stripeSubscriptionId: string, tx?: Tx) {
    return this.d.subscriptions.findByStripeId(stripeSubscriptionId, tx);
  }

  async list(filter: { status?: SubscriptionStatus; q?: string }, page: PageRequest) {
    const { items, total } = await this.d.subscriptions.list(filter, page);
    const rows = await Promise.all(items.map(async (s) => toAdminDto(s, await this.d.subscriptions.documentsGenerated(s))));
    return toPage(rows, total, page);
  }

  async get(id: string) {
    const s = await this.d.subscriptions.findDetail(id);
    if (!s) throw notFound("SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    return toAdminDto(s, await this.d.subscriptions.documentsGenerated(s));
  }

  /** Admin cancel through Stripe ([DECISION] 12); the webhook confirms the final state. */
  async cancel(principal: Principal, id: string, atPeriodEnd: boolean, ctx: RequestContext) {
    const s = await this.d.subscriptions.findDetail(id);
    if (!s) throw notFound("SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    if (s.status === "canceled") throw conflict("SUBSCRIPTION_CANCELED", "This subscription is already canceled");
    if (atPeriodEnd && s.cancelAtPeriodEnd) {
      throw conflict("SUBSCRIPTION_CANCEL_SCHEDULED", "This subscription is already set to end at the period end");
    }
    const updated = await this.d.gateway.cancelSubscription(s.stripeSubscriptionId, atPeriodEnd);
    await this.d.subscriptions.upsert({
      userId: s.userId,
      productId: s.productId,
      stripeSubscriptionId: s.stripeSubscriptionId,
      status: STATUS_MAP[updated.status] ?? s.status,
      currentPeriodStart: updated.currentPeriodStart,
      currentPeriodEnd: updated.currentPeriodEnd,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      canceledAt: updated.canceledAt,
    });
    await this.d.audit.record({ ...actorOf(principal), action: "subscription.cancel", targetType: "subscription", targetId: id, metadata: { atPeriodEnd }, ip: ctx.ip });
    return this.get(id);
  }
}
