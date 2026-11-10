import type { BillingInterval, DocumentType, ProductKind } from "../../../generated/prisma/enums.ts";

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

export interface ProductRepository {
  list(options: { activeOnly: boolean }): Promise<ProductRow[]>;
  findByCodes(codes: string[]): Promise<ProductRow[]>;
  findByCode(code: string): Promise<ProductRow | null>;
  update(code: string, input: { amountCents?: number; isActive?: boolean; stripePriceId?: string | null }): Promise<ProductRow>;
}
