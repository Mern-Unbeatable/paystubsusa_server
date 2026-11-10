import type { DocumentType, OrderStatus } from "../../../generated/prisma/enums.ts";
import type { Tx } from "../../../shared/db/transaction.ts";

export interface EntitlementRow {
  id: string;
  orderId: string;
  documentType: DocumentType;
  creditsTotal: number;
  creditsUsed: number;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface EntitlementWithOrder extends EntitlementRow {
  order: { id: string; userId: string | null; email: string; status: OrderStatus };
}

export interface EntitlementRepository {
  create(input: { orderId: string; documentType: DocumentType; creditsTotal: number; creditsUsed: number }, tx: Tx): Promise<string>;
  findWithOrder(id: string): Promise<EntitlementWithOrder | null>;
  listForOrder(orderId: string): Promise<EntitlementRow[]>;
  /** credits_used += 1 only while credits remain; false when exhausted. */
  consumeCredit(id: string, tx: Tx): Promise<boolean>;
}
