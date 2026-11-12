import { randomUUID } from "node:crypto";
import type { DocumentType } from "../../generated/prisma/enums.ts";
import type { ObjectStorage } from "../../integrations/storage.ts";
import { conflict, notFound, validation } from "../../shared/http/app-error.ts";
import type { PageRequest } from "../../shared/http/pagination.ts";
import { logger } from "../../shared/logger.ts";
import { TEMPLATE_RENDERERS, THEMEABLE_RENDERER, VARIANTLESS_RENDERERS } from "./catalog.schemas.ts";
import { normalizePreview } from "./template-preview.ts";
import type {
  NewProduct,
  ProductFilter,
  ProductRepository,
  ProductRow,
  ProductUpdate,
} from "./repositories/product.repository.ts";
import type {
  NewTemplate,
  TemplateFilter,
  TemplateRepository,
  TemplateRow,
  TemplateUpdate,
  TemplateWithUsage,
} from "./repositories/template.repository.ts";

export const MAX_ADDITIONAL_PAYSTUBS = 50;

/**
 * Seeded templates the generator also bundles (by code) as its offline fallback; they can be
 * restyled while unused, but never deleted. A restyle shows only when the API is reachable.
 */
const SYSTEM_TEMPLATE_KEYS: ReadonlySet<string> = new Set([
  ...["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map((code) => `paystub:${code}`),
  "w2:01",
  "nec1099:01",
  "direct_deposit:01",
]);

export const isSystemTemplate = (t: { documentType: DocumentType; code: string }) =>
  SYSTEM_TEMPLATE_KEYS.has(`${t.documentType}:${t.code}`);

/** Issued documents re-render from the template on regeneration, so a used layout is frozen. */
export const canEditTemplateLayout = (t: TemplateWithUsage) =>
  !VARIANTLESS_RENDERERS.has(t.renderer) && t.usage.documents === 0;

export const canDeleteTemplate = (t: TemplateWithUsage) => !isSystemTemplate(t) && !t.isDefault && t.usage.documents === 0;

/**
 * Seeded products that checkout, subscriptions and order summaries depend on by code.
 * They can be repriced or deactivated, never deleted.
 */
export const SYSTEM_PRODUCT_CODES: ReadonlySet<string> = new Set([
  "paystub_single",
  "paystub_pack_3",
  "paystub_additional",
  "w2_single",
  "nec1099_single",
  "direct_deposit_single",
  "unlimited_monthly",
]);

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
  /** Relative to the API base (e.g. `/template-previews/<id>.webp`); null when none is set. */
  previewImageUrl: t.previewImageKey ? `/${t.previewImageKey}` : null,
});

const itemsError = (message: string) => validation({ items: [message] });
const themeUnsupported = () => validation({ variant: ["This layout doesn't support custom colours and typography"] });

export class CatalogService {
  private readonly products: ProductRepository;
  private readonly templates: TemplateRepository;
  private readonly storage: ObjectStorage;

  constructor(products: ProductRepository, templates: TemplateRepository, storage: ObjectStorage) {
    this.products = products;
    this.templates = templates;
    this.storage = storage;
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

  searchProducts(filter: ProductFilter, page: PageRequest) {
    return this.products.search(filter, page);
  }

  async findProductWithUsage(code: string) {
    const p = await this.products.findWithUsage(code);
    if (!p) throw notFound("PRODUCT_NOT_FOUND", "Product not found");
    return p;
  }

  /**
   * Only one-time base products can be created: subscriptions and add-ons are wired to
   * fixed codes. Paid orders grant paystub credits, so multi-credit packs must be paystubs.
   */
  async createProduct(input: NewProduct) {
    if (input.creditQuantity > 1 && input.documentType !== "paystub") {
      throw validation({ creditQuantity: ["Only paystub packages can include more than one document"] });
    }
    const created = await this.products.create(input);
    if (!created) throw conflict("PRODUCT_CODE_TAKEN", "A product with this code already exists");
    return created;
  }

  async updateProduct(code: string, input: ProductUpdate) {
    if (!(await this.products.findByCode(code))) throw notFound("PRODUCT_NOT_FOUND", "Product not found");
    return this.products.update(code, input);
  }

  /** Products that were ever sold stay for order history; deactivate those instead. */
  async deleteProduct(code: string) {
    const p = await this.findProductWithUsage(code);
    if (SYSTEM_PRODUCT_CODES.has(p.code)) {
      throw conflict("PRODUCT_PROTECTED", "This product is required by checkout and can only be deactivated");
    }
    if (p.usage.orderItems > 0 || p.usage.subscriptions > 0 || !(await this.products.delete(p.id))) {
      throw conflict("PRODUCT_IN_USE", "This product is used by existing orders or subscriptions; deactivate it instead");
    }
    return p;
  }

  searchTemplates(filter: TemplateFilter, page: PageRequest) {
    return this.templates.search(filter, page);
  }

  async findTemplate(id: string) {
    const t = await this.templates.findById(id);
    if (!t) throw notFound("TEMPLATE_NOT_FOUND", "Template not found");
    return t;
  }

  async findTemplateWithUsage(id: string) {
    const t = await this.templates.findWithUsage(id);
    if (!t) throw notFound("TEMPLATE_NOT_FOUND", "Template not found");
    return t;
  }

  /** The renderer must exist in the template bundle; it and the code are fixed after creation. */
  async createTemplate(input: NewTemplate) {
    const renderers: readonly string[] = TEMPLATE_RENDERERS[input.documentType];
    if (!renderers.includes(input.renderer)) {
      throw validation({ renderer: ["This layout is not available for the selected document type"] });
    }
    const variantless = VARIANTLESS_RENDERERS.has(input.renderer);
    if (variantless && input.variant) throw validation({ variant: ["This layout has no style options"] });
    if (!variantless && !input.variant) throw validation({ variant: ["Choose the layout style"] });
    if (input.variant?.theme && input.renderer !== THEMEABLE_RENDERER) throw themeUnsupported();
    const created = await this.templates.create(input);
    if (!created) throw conflict("TEMPLATE_CODE_TAKEN", "A template with this code already exists for this document type");
    return created;
  }

  async updateTemplate(id: string, input: Omit<TemplateUpdate, "previewImageKey">) {
    const t = await this.findTemplateWithUsage(id);
    if (input.isActive === false && t.isDefault) {
      throw validation({ isActive: ["Set another default template before deactivating this one"] });
    }
    if (input.variant && !canEditTemplateLayout(t)) {
      throw conflict(
        "TEMPLATE_LAYOUT_LOCKED",
        "This template's layout can't be changed because documents were issued with it; create a new template instead",
      );
    }
    if (input.variant?.theme && t.renderer !== THEMEABLE_RENDERER) throw themeUnsupported();
    return this.templates.update(id, input);
  }

  async setDefaultTemplate(id: string) {
    const t = await this.findTemplate(id);
    if (!t.isActive) throw validation({ id: ["Activate the template before making it the default"] });
    return this.templates.setDefault(id);
  }

  /** Templates used by issued documents stay for regeneration; deactivate those instead. */
  async deleteTemplate(id: string) {
    const t = await this.findTemplateWithUsage(id);
    if (isSystemTemplate(t)) {
      throw conflict("TEMPLATE_PROTECTED", "Built-in templates can only be deactivated");
    }
    if (t.isDefault) throw conflict("TEMPLATE_IS_DEFAULT", "Set another default template before deleting this one");
    if (t.usage.documents > 0 || !(await this.templates.delete(t.id))) {
      throw conflict("TEMPLATE_IN_USE", "Documents were issued with this template; deactivate it instead");
    }
    if (t.previewImageKey) this.deleteObject(t.previewImageKey);
    return t;
  }

  /** Each upload gets a fresh random key, so the URL changes (cache-busting) and is unguessable. */
  async setTemplatePreview(id: string, image: Buffer) {
    const t = await this.findTemplate(id);
    const key = `template-previews/${randomUUID()}.webp`;
    await this.storage.put(key, await normalizePreview(image), "image/webp");
    const updated = await this.templates.update(id, { previewImageKey: key });
    if (t.previewImageKey) this.deleteObject(t.previewImageKey);
    return updated;
  }

  async removeTemplatePreview(id: string) {
    const t = await this.findTemplate(id);
    if (!t.previewImageKey) return t;
    const updated = await this.templates.update(id, { previewImageKey: null });
    this.deleteObject(t.previewImageKey);
    return updated;
  }

  getTemplatePreview(key: string) {
    return this.storage.get(key);
  }

  private deleteObject(key: string) {
    this.storage.delete(key).catch((err) => logger.warn({ err }, "Could not delete template preview"));
  }
}
