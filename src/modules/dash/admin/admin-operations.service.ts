import type { TransactionManager } from "../../../shared/db/transaction.ts";
import { notFound } from "../../../shared/http/app-error.ts";
import type { Principal, RequestContext } from "../../../shared/types.ts";
import type { PaymentGateway } from "../../../integrations/stripe.ts";
import { actorOf, type AuditService } from "../../audit/index.ts";
import type { UserRepository } from "../../auth/index.ts";
import {
  SYSTEM_PRODUCT_CODES,
  canDeleteTemplate,
  canEditTemplateLayout,
  isSystemTemplate,
  toProductDto,
  toTemplateDto,
  type CatalogService,
  type NewProduct,
  type NewTemplate,
  type ProductFilter,
  type ProductRow,
  type ProductWithUsage,
  type TemplateFilter,
  type TemplateUpdate,
  type TemplateWithUsage,
} from "../../catalog/index.ts";
import { toPage, type PageRequest } from "../../../shared/http/pagination.ts";
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

const toAdminProduct = (p: ProductRow) => ({
  ...toProductDto(p),
  isAddon: p.isAddon,
  isActive: p.isActive,
  stripePriceId: p.stripePriceId,
  updatedAt: p.updatedAt,
  isSystem: SYSTEM_PRODUCT_CODES.has(p.code),
});

const toAdminProductWithUsage = (p: ProductWithUsage) => ({
  ...toAdminProduct(p),
  usage: p.usage,
  canDelete: !SYSTEM_PRODUCT_CODES.has(p.code) && p.usage.orderItems === 0 && p.usage.subscriptions === 0,
});
const toAdminTemplate = (t: TemplateWithUsage) => ({
  ...toTemplateDto(t),
  isActive: t.isActive,
  isSystem: isSystemTemplate(t),
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  usage: t.usage,
  canDelete: canDeleteTemplate(t),
  canEditLayout: canEditTemplateLayout(t),
});

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

  async listProducts(filter: ProductFilter, page: PageRequest) {
    const { items, total } = await this.d.catalog.searchProducts(filter, page);
    return toPage(items.map(toAdminProductWithUsage), total, page);
  }

  async getProduct(code: string) {
    return toAdminProductWithUsage(await this.d.catalog.findProductWithUsage(code));
  }

  async createProduct(principal: Principal, input: NewProduct, ctx: RequestContext) {
    const created = await this.d.catalog.createProduct(input);
    await this.d.audit.record({
      ...actorOf(principal),
      action: "product.create",
      targetType: "product",
      targetId: created.id,
      metadata: { code: created.code, after: input },
      ip: ctx.ip,
    });
    return this.getProduct(created.code);
  }

  async deleteProduct(principal: Principal, code: string, ctx: RequestContext) {
    const deleted = await this.d.catalog.deleteProduct(code);
    await this.d.audit.record({
      ...actorOf(principal),
      action: "product.delete",
      targetType: "product",
      targetId: deleted.id,
      metadata: { code, before: { name: deleted.name, amountCents: deleted.amountCents, isActive: deleted.isActive } },
      ip: ctx.ip,
    });
  }

  /** Recurring products get a new Stripe Price on an amount change; one-time charges use the order total. */
  async updateProduct(
    principal: Principal,
    code: string,
    input: { name?: string; amountCents?: number; badge?: string | null; sortOrder?: number; isActive?: boolean },
    ctx: RequestContext,
  ) {
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
      metadata: {
        code,
        before: {
          name: product.name,
          amountCents: product.amountCents,
          badge: product.badge,
          sortOrder: product.sortOrder,
          isActive: product.isActive,
        },
        after: input,
        stripePriceId,
      },
      ip: ctx.ip,
    });
    return this.getProduct(updated.code);
  }

  async listTemplates(filter: TemplateFilter, page: PageRequest) {
    const { items, total } = await this.d.catalog.searchTemplates(filter, page);
    return toPage(items.map(toAdminTemplate), total, page);
  }

  async getTemplate(id: string) {
    return toAdminTemplate(await this.d.catalog.findTemplateWithUsage(id));
  }

  async createTemplate(principal: Principal, input: NewTemplate, ctx: RequestContext) {
    const created = await this.d.catalog.createTemplate(input);
    await this.d.audit.record({
      ...actorOf(principal),
      action: "template.create",
      targetType: "template",
      targetId: created.id,
      metadata: { after: input },
      ip: ctx.ip,
    });
    return this.getTemplate(created.id);
  }

  async updateTemplate(principal: Principal, id: string, input: Omit<TemplateUpdate, "previewImageKey">, ctx: RequestContext) {
    const before = await this.d.catalog.findTemplate(id);
    await this.d.catalog.updateTemplate(id, input);
    await this.d.audit.record({
      ...actorOf(principal),
      action: "template.update",
      targetType: "template",
      targetId: id,
      metadata: {
        before: { title: before.title, subtitle: before.subtitle, isActive: before.isActive, sortOrder: before.sortOrder, variant: before.variant },
        after: input,
      },
      ip: ctx.ip,
    });
    return this.getTemplate(id);
  }

  async setDefaultTemplate(principal: Principal, id: string, ctx: RequestContext) {
    await this.d.catalog.setDefaultTemplate(id);
    await this.d.audit.record({ ...actorOf(principal), action: "template.set_default", targetType: "template", targetId: id, ip: ctx.ip });
    return this.getTemplate(id);
  }

  async deleteTemplate(principal: Principal, id: string, ctx: RequestContext) {
    const deleted = await this.d.catalog.deleteTemplate(id);
    await this.d.audit.record({
      ...actorOf(principal),
      action: "template.delete",
      targetType: "template",
      targetId: id,
      metadata: { before: { code: deleted.code, documentType: deleted.documentType, title: deleted.title, renderer: deleted.renderer } },
      ip: ctx.ip,
    });
  }

  async setTemplatePreview(principal: Principal, id: string, image: Buffer, ctx: RequestContext) {
    await this.d.catalog.setTemplatePreview(id, image);
    await this.d.audit.record({ ...actorOf(principal), action: "template.preview_update", targetType: "template", targetId: id, ip: ctx.ip });
    return this.getTemplate(id);
  }

  async removeTemplatePreview(principal: Principal, id: string, ctx: RequestContext) {
    await this.d.catalog.removeTemplatePreview(id);
    await this.d.audit.record({ ...actorOf(principal), action: "template.preview_remove", targetType: "template", targetId: id, ip: ctx.ip });
    return this.getTemplate(id);
  }
}
