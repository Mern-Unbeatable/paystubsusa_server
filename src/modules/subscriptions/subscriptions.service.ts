import type { SubscriptionStatus } from "../../generated/prisma/enums.ts";
import { env } from "../../config/env.ts";
import { AppError, conflict, notFound } from "../../shared/http/app-error.ts";
import { toPage, type PageRequest } from "../../shared/http/pagination.ts";
import type { Tx } from "../../shared/db/transaction.ts";
import type { Principal, RequestContext } from "../../shared/types.ts";
import { logger } from "../../shared/logger.ts";
import type { GatewaySubscription, PaymentGateway } from "../../integrations/stripe.ts";
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
}

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

  constructor(deps: Deps) {
    this.d = deps;
  }

  activeFor(userId: string) {
    return this.d.subscriptions.findActiveForUser(userId);
  }

  /** GET /me/subscription; null when the customer has never subscribed. */
  async getMine(userId: string) {
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
    if (await this.d.subscriptions.findActiveForUser(userId)) {
      throw conflict("SUBSCRIPTION_ACTIVE", "You already have an active subscription");
    }
    const product = await this.d.catalog.findProduct(SUBSCRIPTION_PRODUCT_CODE);
    if (!product?.isActive || !product.stripePriceId) {
      throw new AppError("SUBSCRIPTION_UNAVAILABLE", 503, "The Unlimited plan is not available right now");
    }
    const customerId = await this.ensureCustomer(userId);
    const url = await this.d.gateway.createSubscriptionCheckout({
      customerId,
      priceId: product.stripePriceId,
      userId,
      successUrl: `${env.APP_URL}/customer/subscription?checkout=success`,
      cancelUrl: `${env.APP_URL}/customer/subscription?checkout=canceled`,
    });
    return { url };
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
