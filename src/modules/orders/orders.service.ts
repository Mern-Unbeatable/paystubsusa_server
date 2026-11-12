import type { DocumentType } from "../../generated/prisma/enums.ts";
import { env } from "../../config/env.ts";
import { AppError, conflict, forbidden, notFound, validation } from "../../shared/http/app-error.ts";
import { sha256 } from "../../shared/crypto/tokens.ts";
import type { TransactionManager, Tx } from "../../shared/db/transaction.ts";
import { toPage, type PageRequest } from "../../shared/http/pagination.ts";
import { canAccessOrder, scopeOf } from "../../shared/policies/access.ts";
import type { GuestPrincipal, Principal, RequestContext, UserPrincipal } from "../../shared/types.ts";
import { logger } from "../../shared/logger.ts";
import type { AuditService } from "../audit/index.ts";
import type { UserRepository, GuestOrderLinker } from "../auth/index.ts";
import type { CatalogService } from "../catalog/index.ts";
import type { DocumentsService } from "../documents/index.ts";
import type { NotificationsService } from "../notifications/index.ts";
import type { PaymentsService } from "../payments/index.ts";
import type { SubscriptionsService } from "../subscriptions/index.ts";
import type { EntitlementsService } from "./entitlements.service.ts";
import type { OrderListFilter, OrderRepository, OrderRow } from "./repositories/order.repository.ts";

export const UNLIMITED_PRODUCT_CODE = "unlimited_monthly";
/** [DECISION] 3 default: fair-use cap for Unlimited, per billing period. */
export const UNLIMITED_FAIR_USE_PER_PERIOD = 100;
export const UNPAID_ORDER_TTL_MS = 24 * 60 * 60 * 1000;

export interface CreateOrderInput {
  documentType: DocumentType;
  templateId: string;
  items: { productCode: string; quantity: number }[];
  formData: unknown;
  termsAccepted: true;
}

interface Deps {
  orders: OrderRepository;
  users: UserRepository;
  catalog: CatalogService;
  documents: DocumentsService;
  entitlements: EntitlementsService;
  payments: PaymentsService;
  subscriptions: SubscriptionsService;
  notifications: NotificationsService;
  audit: AuditService;
  tx: TransactionManager;
}

export class OrdersService implements GuestOrderLinker {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  /** Email comes from the guest token or the account, never the body ([DECISION] 15 auto-links guests). */
  private async resolveOwner(principal: UserPrincipal | GuestPrincipal, extraGuestEmail: string | undefined) {
    if (principal.type === "guest") {
      const account = await this.d.users.findByEmail(principal.email);
      const linkedUserId = account?.emailVerifiedAt && account.status === "active" ? account.id : null;
      return { userId: linkedUserId, email: principal.email, customerId: null as string | null };
    }
    const user = await this.d.users.findById(principal.userId);
    if (!user || user.status !== "active") throw forbidden("ACCOUNT_SUSPENDED", "This account has been suspended");
    if (!user.emailVerifiedAt && extraGuestEmail !== user.email) {
      throw forbidden("EMAIL_VERIFICATION_REQUIRED", "Verify your email before checking out");
    }
    return { userId: user.id, email: user.email, customerId: user.stripeCustomerId };
  }

  async createOrder(
    principal: UserPrincipal | GuestPrincipal,
    input: CreateOrderInput,
    idempotencyKey: string,
    ctx: RequestContext & { extraGuestEmail?: string },
  ) {
    const owner = await this.resolveOwner(principal, ctx.extraGuestEmail);
    const ownerKey = sha256(`${principal.type === "user" ? `user:${principal.userId}` : `guest:${principal.email}`}|${idempotencyKey}`);

    const existing = await this.d.orders.findByIdempotencyKey(ownerKey);
    if (existing) return this.replay(existing, owner.customerId);

    await this.d.catalog.requireActiveTemplate(input.templateId, input.documentType);
    const quote = await this.d.catalog.quote(input.items);
    let totalCents = quote.totalCents;

    if (quote.isSubscription) {
      if (principal.type !== "user") throw forbidden("ACCOUNT_REQUIRED", "Sign in to use your Unlimited plan");
      const sub = await this.d.subscriptions.activeFor(principal.userId);
      if (!sub) throw conflict("SUBSCRIPTION_REQUIRED", "You need an active Unlimited subscription");
      const since = sub.currentPeriodStart ?? new Date(Date.now() - 31 * 86_400_000);
      const used = await this.d.documents.countSubscriptionDocumentsSince(principal.userId, UNLIMITED_PRODUCT_CODE, since);
      if (used >= UNLIMITED_FAIR_USE_PER_PERIOD) {
        throw conflict("FAIR_USE_LIMIT_REACHED", `The Unlimited plan includes ${UNLIMITED_FAIR_USE_PER_PERIOD} documents per billing period`);
      }
      totalCents = 0;
    } else if (quote.documentType !== input.documentType) {
      throw validation({ items: ["These products don't match the document type"] });
    }

    const prepared = await this.d.documents.prepare(input.documentType, input.formData);
    const now = new Date();
    const isFree = totalCents === 0;

    const order = await this.d.tx.run(async (tx) => {
      const created = await this.d.orders.create(
        {
          userId: owner.userId,
          email: owner.email,
          emailVerifiedAt: now,
          documentType: input.documentType,
          status: isFree ? "paid" : "pending_payment",
          subtotalCents: quote.isSubscription ? 0 : quote.subtotalCents,
          totalCents,
          currency: quote.currency,
          termsAcceptedAt: now,
          idempotencyKey: ownerKey,
          createdIp: ctx.ip ?? null,
          paidAt: isFree ? now : null,
          items: quote.lines.map((l) => ({ ...l, ...(quote.isSubscription ? { unitAmountCents: 0, amountCents: 0 } : {}) })),
        },
        tx,
      );
      if (!created) return null;
      await this.d.documents.create(
        { orderId: created.id, templateId: input.templateId, entitlementId: null, status: "awaiting_payment", prepared },
        tx,
      );
      if (isFree) await this.fulfill(created, tx, { sendReceipt: false });
      return created;
    });

    // Lost a race with a concurrent request using the same key: return that order.
    if (!order) {
      const raced = await this.d.orders.findByIdempotencyKey(ownerKey);
      if (!raced) throw new AppError("ORDER_CREATE_FAILED", 500, "Could not create the order");
      return this.replay(raced, owner.customerId);
    }
    return this.withPayment(order, owner.customerId);
  }

  private async replay(order: OrderRow, customerId: string | null) {
    return this.withPayment((await this.d.orders.findById(order.id)) ?? order, customerId);
  }

  private async withPayment(order: OrderRow, customerId: string | null) {
    const needsPayment = order.totalCents > 0 && (order.status === "pending_payment" || order.status === "failed");
    const clientSecret = needsPayment ? await this.d.payments.ensureIntent(order, customerId) : null;
    return {
      order: await this.toDto(order),
      payment: clientSecret ? { provider: "stripe" as const, clientSecret } : null,
    };
  }

  async get(principal: Principal, orderId: string) {
    const order = await this.d.orders.findById(orderId);
    if (!order || !canAccessOrder(principal, order)) throw notFound("ORDER_NOT_FOUND", "Order not found");
    return this.toDto(order);
  }

  async list(principal: Principal, filter: OrderListFilter, page: PageRequest) {
    const { items, total } = await this.d.orders.list(scopeOf(principal), filter, page);
    return toPage(items.map(toOrderSummary), total, page);
  }

  /** Admin customer detail. */
  async listForUser(userId: string, page: PageRequest) {
    const { items, total } = await this.d.orders.list({ kind: "user", userId }, {}, page);
    return toPage(items.map(toOrderSummary), total, page);
  }

  async toDto(order: OrderRow) {
    const [documents, entitlements] = await Promise.all([
      this.d.documents.listByOrder(order.id),
      this.d.entitlements.listForOrder(order.id),
    ]);
    return {
      ...toOrderSummary(order),
      items: order.items.map(({ productCode, name, quantity, unitAmountCents, amountCents }) => ({ productCode, name, quantity, unitAmountCents, amountCents })),
      documents,
      entitlements: entitlements.map((e) => ({
        id: e.id,
        documentType: e.documentType,
        creditsTotal: e.creditsTotal,
        creditsUsed: e.creditsUsed,
        creditsRemaining: e.creditsTotal - e.creditsUsed,
        expiresAt: e.expiresAt,
      })),
    };
  }

  findById(orderId: string) {
    return this.d.orders.findById(orderId);
  }

  lockForUpdate(orderId: string, tx: Tx) {
    return this.d.orders.lockById(orderId, tx);
  }

  /** Paid: queue renders, grant credits, link a verified account, send the receipt. Runs in the webhook transaction. */
  async fulfill(
    order: OrderRow,
    tx: Tx,
    options: { sendReceipt: boolean; card?: { cardBrand: string | null; cardLast4: string | null; receiptUrl: string | null } } = { sendReceipt: true },
  ) {
    const paidAt = order.paidAt ?? new Date();
    await this.d.orders.updateStatus(order.id, "paid", tx, paidAt);
    await this.d.documents.queueForPaidOrder(order.id, tx);

    if (order.documentType === "paystub" && !order.items.some((i) => i.productCode === UNLIMITED_PRODUCT_CODE)) {
      const credits = await this.d.orders.creditsForOrder(order.id, tx);
      await this.d.entitlements.grant(order.id, "paystub", credits, tx);
    }

    if (!order.userId) {
      const account = await this.d.users.findByEmail(order.email);
      if (account?.emailVerifiedAt) await this.d.orders.setUserIfNull(order.id, account.id, tx);
    }

    if (options.sendReceipt) {
      await this.d.notifications.enqueue(
        "order_receipt",
        order.email,
        {
          orderNumber: order.orderNumber,
          totalCents: order.totalCents,
          paidAt: paidAt.toISOString(),
          billedTo: order.email,
          cardBrand: options.card?.cardBrand ?? null,
          cardLast4: options.card?.cardLast4 ?? null,
          receiptUrl: options.card?.receiptUrl ?? null,
          generatorUrl: `${env.APP_URL}/paystub-generator`,
          documentsUrl: `${env.APP_URL}/find-paystubs`,
          lines: order.items.map((i) => ({ name: i.name, quantity: i.quantity, amountCents: i.amountCents })),
        },
        { relatedOrderId: order.id, tx },
      );
    }
    await this.d.audit.record({ actorType: "system", action: "order.paid", targetType: "order", targetId: order.id }, tx);
  }

  async markFailed(order: OrderRow, tx: Tx, reason: string) {
    if (order.status !== "pending_payment") return;
    await this.d.orders.updateStatus(order.id, "failed", tx);
    await this.d.audit.record({ actorType: "system", action: "order.payment_failed", targetType: "order", targetId: order.id, metadata: { reason } }, tx);
  }

  /** From `charge.refunded`. A full refund revokes downloads ([DECISION] 13). */
  async applyRefund(order: OrderRow, full: boolean, refundedCents: number, tx: Tx) {
    if (order.status !== "paid" && order.status !== "partially_refunded") return;
    await this.d.orders.updateStatus(order.id, full ? "refunded" : "partially_refunded", tx);
    if (full) await this.d.documents.revokeForOrder(order.id, tx);
    await this.d.audit.record(
      { actorType: "system", action: full ? "order.refunded" : "order.partially_refunded", targetType: "order", targetId: order.id, metadata: { refundedCents } },
      tx,
    );
  }

  async flagAmountMismatch(order: OrderRow, received: { amountCents: number; currency: string }, tx: Tx) {
    await this.d.orders.updateStatus(order.id, "failed", tx);
    await this.d.audit.record(
      { actorType: "system", action: "order.amount_mismatch", targetType: "order", targetId: order.id, metadata: { expectedCents: order.totalCents, expectedCurrency: order.currency, ...received } },
      tx,
    );
    logger.error({ orderId: order.id }, "Payment amount mismatch; order not fulfilled");
  }

  linkGuestOrders(userId: string, email: string, tx?: Tx) {
    return this.d.orders.linkGuestOrders(userId, email, tx);
  }

  /** Expiry job: cancel orders unpaid for 24 h, after canceling their PaymentIntents. */
  async expireUnpaid(now: Date) {
    let canceled = 0;
    for (const id of await this.d.orders.findExpirable(new Date(now.getTime() - UNPAID_ORDER_TTL_MS), 200)) {
      try {
        if ((await this.d.payments.cancelOpenIntents(id)) && (await this.d.orders.cancelIfUnpaid(id))) canceled++;
      } catch (err) {
        logger.warn({ err, orderId: id }, "Could not expire order");
      }
    }
    return canceled;
  }
}

export const toOrderSummary = (o: OrderRow) => ({
  id: o.id,
  orderNumber: o.orderNumber,
  status: o.status,
  email: o.email,
  userId: o.userId,
  documentType: o.documentType,
  summary: o.items
    .map((i) => (i.productCode === "paystub_additional" ? `${i.quantity} additional` : i.name))
    .join(" + "),
  subtotalCents: o.subtotalCents,
  totalCents: o.totalCents,
  currency: o.currency,
  createdAt: o.createdAt,
  paidAt: o.paidAt,
});
