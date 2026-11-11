import type { BillingInterval, DocumentType, ProductKind } from "../../../generated/prisma/enums.ts";
import type { PageRequest } from "../../../shared/http/pagination.ts";

export interface ProductRow {
  id: string;
  code: string;
  documentType: DocumentType | null;
  kind: ProductKind;
  name: string;
  amountCents: number;
  currency: string;
  interval: BillingInterval | null;
  creditQuantity: number;
  isAddon: boolean;
  isActive: boolean;
  stripePriceId: string | null;
  badge: string | null;
  sortOrder: number;
  updatedAt: Date;
}

/** How many order lines and subscriptions reference a product (both block deletion). */
export interface ProductUsage {
  orderItems: number;
  subscriptions: number;
}

export type ProductWithUsage = ProductRow & { usage: ProductUsage };

export interface ProductFilter {
  q?: string;
  kind?: ProductKind;
  documentType?: DocumentType;
  isActive?: boolean;
}

export interface NewProduct {
  code: string;
  documentType: DocumentType;
  name: string;
  amountCents: number;
  creditQuantity: number;
  badge: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ProductUpdate {
  name?: string;
  amountCents?: number;
  badge?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  stripePriceId?: string | null;
}

export interface ProductRepository {
  list(options: { activeOnly: boolean }): Promise<ProductRow[]>;
  search(filter: ProductFilter, page: PageRequest): Promise<{ items: ProductWithUsage[]; total: number }>;
  findByCodes(codes: string[]): Promise<ProductRow[]>;
  findByCode(code: string): Promise<ProductRow | null>;
  findWithUsage(code: string): Promise<ProductWithUsage | null>;
  /** Returns null when the code is already taken. */
  create(input: NewProduct): Promise<ProductRow | null>;
  update(code: string, input: ProductUpdate): Promise<ProductRow>;
  /** False when the row is still referenced (FK restrict) or already gone. */
  delete(id: string): Promise<boolean>;
}
