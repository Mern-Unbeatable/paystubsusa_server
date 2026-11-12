import type { PaymentStatus, OrderStatus } from "../../../generated/prisma/enums.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import type { PageRequest } from "../../../shared/http/pagination.ts";

export interface PaymentRow {
  id: string;
  orderId: string | null;
  subscriptionId: string | null;
  provider: string;
  providerPaymentId: string;
  amountCents: number;
  amountRefundedCents: number;
  currency: string;
  status: PaymentStatus;
  cardBrand: string | null;
  cardLast4: string | null;
  receiptUrl: string | null;
  failureCode: string | null;
  createdAt: Date;
}

/** Payment joined with what's needed for ownership checks and the description column. */
export interface PaymentWithOwner extends PaymentRow {
  order: { id: string; orderNumber: string; userId: string | null; email: string; status: OrderStatus; items: { name: string; quantity: number; productCode: string }[] } | null;
  subscription: { id: string; userId: string; productName: string } | null;
}

import type { OwnerScope } from "../../../shared/policies/access.ts";
export type PaymentScope = OwnerScope;

export interface PaymentListFilter {
  status?: PaymentStatus;
  from?: Date;
  to?: Date;
  q?: string;
}

export interface PaymentRepository {
  /** Inserts or updates the row for a Stripe PaymentIntent. */
  upsertIntent(
    input: {
      orderId: string;
      providerPaymentId: string;
      amountCents: number;
      currency: string;
      status: PaymentStatus;
      cardBrand?: string | null;
      cardLast4?: string | null;
      receiptUrl?: string | null;
      failureCode?: string | null;
    },
    tx?: Tx,
  ): Promise<PaymentRow>;
  upsertInvoice(
    input: {
      subscriptionId: string;
      providerPaymentId: string;
      amountCents: number;
      currency: string;
      status: PaymentStatus;
      receiptUrl?: string | null;
      cardBrand?: string | null;
      cardLast4?: string | null;
    },
    tx?: Tx,
  ): Promise<PaymentRow>;
  findByProviderId(providerPaymentId: string, tx?: Tx): Promise<PaymentRow | null>;
  updateRefund(id: string, amountRefundedCents: number, status: PaymentStatus, tx: Tx): Promise<void>;
  listForOrder(orderId: string): Promise<PaymentRow[]>;
  findWithOwner(id: string): Promise<PaymentWithOwner | null>;
  list(scope: PaymentScope, filter: PaymentListFilter, page: PageRequest): Promise<{ items: PaymentWithOwner[]; total: number }>;
}
