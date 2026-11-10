import type { DocumentType } from "../../../generated/prisma/enums.ts";
import type { TransactionManager } from "../../../shared/db/transaction.ts";
import { notFound } from "../../../shared/http/app-error.ts";
import type { Principal, RequestContext } from "../../../shared/types.ts";
import type { PaymentGateway } from "../../../integrations/stripe.ts";
import { actorOf, type AuditService } from "../../audit/index.ts";
import type { UserRepository } from "../../auth/index.ts";
import { toProductDto, toTemplateDto, type CatalogService, type ProductRow, type TemplateRow } from "../../catalog/index.ts";
import type { DocumentsService } from "../../documents/index.ts";
import type { OrdersService } from "../../orders/index.ts";
import type { PaymentsService } from "../../payments/index.ts";

interface Deps {
  orders: OrdersService;
  payments: PaymentsService;
  documents: DocumentsService;
  catalog: CatalogService;
  users: UserRepository;
  gateway: PaymentGateway;
  audit: AuditService;
  tx: TransactionManager;
}

const toAdminProduct = (p: ProductRow) => ({ ...toProductDto(p), isAddon: p.isAddon, isActive: p.isActive, stripePriceId: p.stripePriceId, updatedAt: p.updatedAt });
const toAdminTemplate = (t: TemplateRow) => ({ ...toTemplateDto(t), isActive: t.isActive });

/** Admin mutations and detail views that span several modules. Every mutation is audited. */
export class AdminOperationsService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  async orderDetail(id: string) {
    const order = await this.d.orders.findById(id);
    if (!order) throw notFound("ORDER_NOT_FOUND", "Order not found");
    const [dto, payments, user] = await Promise.all([
      this.d.orders.toDto(order),
      this.d.payments.listForOrder(id),
      order.userId ? this.d.users.findById(order.userId) : null,
    ]);
    return {
      ...dto,
      payments: payments.map((p) => ({
        id: p.id,
        providerPaymentId: p.providerPaymentId,
        amountCents: p.amountCents,
        amountRefundedCents: p.amountRefundedCents,
        currency: p.currency,
        status: p.status,
        cardBrand: p.cardBrand,
        cardLast4: p.cardLast4,
        receiptUrl: p.receiptUrl,
        failureCode: p.failureCode,
        createdAt: p.createdAt,
      })),
      refunds: payments.filter((p) => p.amountRefundedCents > 0).map((p) => ({ paymentId: p.id, amountRefundedCents: p.amountRefundedCents, status: p.status })),
      user: user ? { id: user.id, name: user.name, email: user.email, status: user.status } : null,
    };
  }

  /** [DECISION] 13: the final state comes from the `charge.refunded` webhook. */
  async refund(principal: Principal, orderId: string, input: { amountCents?: number; reason: string }, idempotencyKey: string, ctx: RequestContext) {
    const order = await this.d.orders.findById(orderId);
    if (!order) throw notFound("ORDER_NOT_FOUND", "Order not found");
    const result = await this.d.payments.requestRefund(order, input.amountCents ?? null, idempotencyKey);
    await this.d.audit.record({
      ...actorOf(principal),
      action: "order.refund_requested",
      targetType: "order",
      targetId: orderId,
      metadata: { amountCents: result.amountCents, reason: input.reason, refundId: result.refundId },
      ip: ctx.ip,
    });
    return result;
  }

  async regenerateDocument(principal: Principal, documentId: string, ctx: RequestContext) {
    await this.d.tx.run((tx) => this.d.documents.regenerate(principal, documentId, ctx, tx));
    return this.d.documents.getForAdmin(principal, documentId);
  }

  async listProducts() {
    return (await this.d.catalog.listAllProducts()).map(toAdminProduct);
  }

  /** Recurring products get a new Stripe Price on an amount change; one-time charges use the order total. */
  async updateProduct(principal: Principal, code: string, input: { amountCents?: number; isActive?: boolean }, ctx: RequestContext) {
    const product = await this.d.catalog.findProduct(code);
    if (!product) throw notFound("PRODUCT_NOT_FOUND", "Product not found");
    let stripePriceId: string | undefined;
    if (input.amountCents !== undefined && input.amountCents !== product.amountCents && (product.interval || product.stripePriceId)) {
      stripePriceId = await this.d.gateway.createPrice({
        previousPriceId: product.stripePriceId,
        productName: product.name,
        amountCents: input.amountCents,
        currency: product.currency,
        interval: product.interval ? "month" : null,
      });
    }
    const updated = await this.d.catalog.updateProduct(code, { ...input, ...(stripePriceId ? { stripePriceId } : {}) });
    await this.d.audit.record({
      ...actorOf(principal),
      action: "product.update",
      targetType: "product",
      targetId: product.id,
      metadata: { code, before: { amountCents: product.amountCents, isActive: product.isActive }, after: input, stripePriceId },
      ip: ctx.ip,
    });
    return toAdminProduct(updated);
  }

  async listTemplates(documentType?: DocumentType) {
    return (await this.d.catalog.listAllTemplates(documentType)).map(toAdminTemplate);
  }

  async updateTemplate(principal: Principal, id: string, input: { title?: string; subtitle?: string | null; isActive?: boolean; sortOrder?: number }, ctx: RequestContext) {
    const updated = await this.d.catalog.updateTemplate(id, input);
    await this.d.audit.record({ ...actorOf(principal), action: "template.update", targetType: "template", targetId: id, metadata: input, ip: ctx.ip });
    return toAdminTemplate(updated);
  }

  async setDefaultTemplate(principal: Principal, id: string, ctx: RequestContext) {
    const updated = await this.d.catalog.setDefaultTemplate(id);
    await this.d.audit.record({ ...actorOf(principal), action: "template.set_default", targetType: "template", targetId: id, ip: ctx.ip });
    return toAdminTemplate(updated);
  }
}
