import type { DocumentType, OrderStatus } from "../../../generated/prisma/enums.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import type { PageRequest } from "../../../shared/http/pagination.ts";
import type { OwnerScope } from "../../../shared/policies/access.ts";

export interface OrderItemRow {
  productId: string;
  productCode: string;
  name: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
}

export interface OrderRow {
  id: string;
  orderNumber: string;
  userId: string | null;
  email: string;
  emailVerifiedAt: Date | null;
  documentType: DocumentType;
  status: OrderStatus;
  subtotalCents: number;
  totalCents: number;
  currency: string;
  createdAt: Date;
  paidAt: Date | null;
  items: OrderItemRow[];
}

export interface NewOrder {
  userId: string | null;
  email: string;
  emailVerifiedAt: Date;
  documentType: DocumentType;
  status: "pending_payment" | "paid";
  subtotalCents: number;
  totalCents: number;
  currency: string;
  termsAcceptedAt: Date;
  idempotencyKey: string;
  createdIp: string | null;
  paidAt: Date | null;
  items: OrderItemRow[];
}

export interface OrderListFilter {
  status?: OrderStatus;
  documentType?: DocumentType;
  q?: string;
  from?: Date;
  to?: Date;
}

export interface OrderRepository {
  /** null when the idempotency key already exists. */
  create(input: NewOrder, tx: Tx): Promise<OrderRow | null>;
  findByIdempotencyKey(key: string): Promise<OrderRow | null>;
  findById(id: string): Promise<OrderRow | null>;
  /** SELECT … FOR UPDATE inside the caller's transaction. */
  lockById(id: string, tx: Tx): Promise<OrderRow | null>;
  updateStatus(id: string, status: OrderStatus, tx: Tx, paidAt?: Date): Promise<void>;
  setUserIfNull(id: string, userId: string, tx: Tx): Promise<void>;
  /** UPDATE orders SET user_id WHERE user_id IS NULL AND email = :verifiedEmail. */
  linkGuestOrders(userId: string, email: string, tx?: Tx): Promise<number>;
  list(scope: OwnerScope, filter: OrderListFilter, page: PageRequest): Promise<{ items: OrderRow[]; total: number }>;
  /** Paystub credits bought: Σ quantity × product.credit_quantity. */
  creditsForOrder(orderId: string, tx: Tx): Promise<number>;
  findExpirable(createdBefore: Date, limit: number): Promise<string[]>;
  cancelIfUnpaid(id: string): Promise<boolean>;
}
