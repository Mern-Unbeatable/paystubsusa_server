import type { DocumentType } from "../../generated/prisma/enums.ts";
import { notFound, validation } from "../../shared/http/app-error.ts";
import type { ProductRepository, ProductRow } from "./repositories/product.repository.ts";
import type { TemplateRepository, TemplateRow } from "./repositories/template.repository.ts";

export const MAX_ADDITIONAL_PAYSTUBS = 50;

export interface QuoteLine {
  productId: string;
  productCode: string;
  name: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
}

export interface Quote {
  documentType: DocumentType | null;
  /** True when the only line is the subscription plan. */
  isSubscription: boolean;
  lines: QuoteLine[];
  /** Paystub credits granted by the order (pack size + additional). */
  credits: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
}

export const toProductDto = (p: ProductRow) => ({
  code: p.code,
  documentType: p.documentType,
  kind: p.kind,
  name: p.name,
  amountCents: p.amountCents,
  currency: p.currency,
  interval: p.interval,
  creditQuantity: p.creditQuantity,
  badge: p.badge,
  sortOrder: p.sortOrder,
});

export const toTemplateDto = (t: TemplateRow) => ({
  id: t.id,
  code: t.code,
  documentType: t.documentType,
  title: t.title,
  subtitle: t.subtitle,
  renderer: t.renderer,
  variant: t.variant,
  isDefault: t.isDefault,
  sortOrder: t.sortOrder,
});

const itemsError = (message: string) => validation({ items: [message] });

export class CatalogService {
  private readonly products: ProductRepository;
  private readonly templates: TemplateRepository;

  constructor(products: ProductRepository, templates: TemplateRepository) {
    this.products = products;
    this.templates = templates;
  }

  async listProducts() {
    return (await this.products.list({ activeOnly: true })).map(toProductDto);
  }

  async listTemplates(documentType?: DocumentType) {
    return (await this.templates.list({ activeOnly: true, documentType })).map(toTemplateDto);
  }

  /** An active template of the given type, or 422. */
  async requireActiveTemplate(templateId: string, documentType: DocumentType) {
    const t = await this.templates.findById(templateId);
    if (!t || !t.isActive || t.documentType !== documentType) {
      throw validation({ templateId: ["Choose an available template for this document"] });
    }
    return t;
  }

  findProduct(code: string) {
    return this.products.findByCode(code);
  }

  /**
   * Server-side price from `products` (spec section 14.2). Rules: one base product with
   * quantity 1; only paystubs take the `paystub_additional` add-on (0–50); the subscription
   * plan is quoted alone.
   */
  async quote(items: { productCode: string; quantity: number }[]): Promise<Quote> {
    if (items.length === 0) throw itemsError("Add at least one product");
    const codes = items.map((i) => i.productCode);
    if (new Set(codes).size !== codes.length) throw itemsError("Each product can appear only once");

    const found = new Map((await this.products.findByCodes(codes)).map((p) => [p.code, p]));
    const resolved = items.map((i) => {
      const p = found.get(i.productCode);
      if (!p || !p.isActive) throw itemsError(`Unknown or unavailable product: ${i.productCode}`);
      return { product: p, quantity: i.quantity };
    });

    const subscription = resolved.filter((r) => r.product.kind === "subscription");
    if (subscription.length > 0 && resolved.length > 1) throw itemsError("The subscription plan must be ordered on its own");

    const bases = resolved.filter((r) => !r.product.isAddon);
    const addons = resolved.filter((r) => r.product.isAddon);
    if (bases.length !== 1) throw itemsError("Choose exactly one package");
    const base = bases[0]!;
    if (base.quantity !== 1) throw itemsError("The package quantity must be 1");

    const documentType = base.product.documentType;
    for (const a of addons) {
      if (a.product.documentType !== documentType || documentType !== "paystub") {
        throw itemsError(`${a.product.name} can't be added to this package`);
      }
      if (a.quantity < 1 || a.quantity > MAX_ADDITIONAL_PAYSTUBS) {
        throw itemsError(`Additional paystubs must be between 1 and ${MAX_ADDITIONAL_PAYSTUBS}`);
      }
    }

    const currency = base.product.currency;
    if (resolved.some((r) => r.product.currency !== currency)) throw itemsError("Products must share one currency");

    const lines = resolved.map(({ product, quantity }) => ({
      productId: product.id,
      productCode: product.code,
      name: product.name,
      quantity,
      unitAmountCents: product.amountCents,
      amountCents: product.amountCents * quantity,
    }));
    const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);
    return {
      documentType,
      isSubscription: subscription.length > 0,
      lines,
      credits: resolved.reduce((s, r) => s + r.product.creditQuantity * r.quantity, 0),
      subtotalCents,
      taxCents: 0,
      totalCents: subtotalCents,
      currency,
    };
  }

  // Admin operations: the catalog owns these tables; dash/admin adds audit and Stripe.
  listAllProducts() {
    return this.products.list({ activeOnly: false });
  }

  async updateProduct(code: string, input: { amountCents?: number; isActive?: boolean; stripePriceId?: string | null }) {
    if (!(await this.products.findByCode(code))) throw notFound("PRODUCT_NOT_FOUND", "Product not found");
    return this.products.update(code, input);
  }

  listAllTemplates(documentType?: DocumentType) {
    return this.templates.list({ activeOnly: false, documentType });
  }

  async findTemplate(id: string) {
    const t = await this.templates.findById(id);
    if (!t) throw notFound("TEMPLATE_NOT_FOUND", "Template not found");
    return t;
  }

  async updateTemplate(id: string, input: { title?: string; subtitle?: string | null; isActive?: boolean; sortOrder?: number }) {
    const t = await this.findTemplate(id);
    if (input.isActive === false && t.isDefault) {
      throw validation({ isActive: ["Set another default template before deactivating this one"] });
    }
    return this.templates.update(id, input);
  }

  async setDefaultTemplate(id: string) {
    const t = await this.findTemplate(id);
    if (!t.isActive) throw validation({ id: ["Activate the template before making it the default"] });
    return this.templates.setDefault(id);
  }
}
