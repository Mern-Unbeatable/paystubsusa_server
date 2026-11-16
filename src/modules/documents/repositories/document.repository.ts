import type { DocumentStatus, DocumentType, OrderStatus } from "../../../generated/prisma/enums.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import type { PageRequest, Sort } from "../../../shared/http/pagination.ts";

import type { OwnerScope } from "../../../shared/policies/access.ts";

/** List scoping is applied in SQL, never by filtering after fetch. */
export type DocumentScope = OwnerScope;

export interface DocumentListFilter {
  type?: DocumentType;
  status?: DocumentStatus;
  q?: string;
  sort: Sort<"createdAt" | "title">;
}

export interface DocumentListRow {
  id: string;
  documentNumber: string;
  type: DocumentType;
  title: string;
  employerName: string | null;
  recipientName: string | null;
  amountCents: number | null;
  status: DocumentStatus;
  createdAt: Date;
  orderId: string;
  orderNumber: string;
  email: string;
}

export interface DocumentWithOrder {
  id: string;
  documentNumber: string;
  type: DocumentType;
  title: string;
  employerName: string | null;
  recipientName: string | null;
  amountCents: number | null;
  status: DocumentStatus;
  fileName: string;
  pdfStorageKey: string | null;
  downloadCount: number;
  renderedAt: Date | null;
  purgedAt: Date | null;
  createdAt: Date;
  templateId: string;
  entitlementId: string | null;
  order: { id: string; orderNumber: string; userId: string | null; email: string; status: OrderStatus };
}

export interface RenderableDocument {
  id: string;
  orderId: string;
  type: DocumentType;
  formDataEnc: Uint8Array | null;
  formDataKeyId: string | null;
  createdAt: Date;
  /** Null until the first successful render; regenerations keep it. */
  renderedAt: Date | null;
  /** Previous object key when regenerating; used to delete orphans after a path change. */
  pdfStorageKey: string | null;
  template: { code: string; renderer: string; variant: unknown };
  order: {
    email: string;
    userId: string | null;
    user: { name: string } | null;
  };
}

export interface NewDocument {
  orderId: string;
  entitlementId: string | null;
  templateId: string;
  type: DocumentType;
  title: string;
  employerName: string;
  recipientName: string;
  amountCents: number;
  fileName: string;
  formDataEnc: Uint8Array<ArrayBuffer>;
  formDataKeyId: string;
  status: "awaiting_payment" | "queued";
}

export interface DocumentRepository {
  create(input: NewDocument, tx?: Tx): Promise<{ id: string; documentNumber: string; type: DocumentType; status: DocumentStatus }>;
  /** awaiting_payment → queued for a paid order; returns the queued ids. */
  queueAwaitingForOrder(orderId: string, tx: Tx): Promise<string[]>;
  revokeForOrder(orderId: string, tx: Tx): Promise<number>;
  findWithOrder(id: string): Promise<DocumentWithOrder | null>;
  list(scope: DocumentScope, filter: DocumentListFilter, page: PageRequest): Promise<{ items: DocumentListRow[]; total: number }>;
  listByOrder(orderId: string): Promise<{ id: string; documentNumber: string; type: DocumentType; title: string; status: DocumentStatus; createdAt: Date }[]>;
  /** queued (or rendering after a crash) → rendering; null if not renderable. */
  startRender(id: string): Promise<RenderableDocument | null>;
  markReady(id: string, pdfStorageKey: string, pdfSha256: string): Promise<void>;
  markFailed(id: string): Promise<void>;
  incrementDownloads(id: string): Promise<void>;
  /** ready | failed → queued, if the form data still exists. */
  requeue(id: string, tx: Tx): Promise<boolean>;
  purgeFormDataRenderedBefore(before: Date): Promise<number>;
  /** Guest-order PDFs older than `before` ([DECISION] 5: guests keep PDFs one year). */
  listGuestPdfsBefore(before: Date, limit: number): Promise<{ id: string; pdfStorageKey: string }[]>;
  clearPdf(id: string): Promise<void>;
  /** Documents created under the given subscription product since `since` (fair use). */
  countSubscriptionDocumentsSince(userId: string, productCode: string, since: Date): Promise<number>;
  /**
   * 1-based stable index of this document among the same owner's docs in the same UTC year/month
   * (ordered by createdAt, id). Used for `{type}_{NNN}.pdf` filenames.
   */
  ownerMonthSequence(input: {
    documentId: string;
    createdAt: Date;
    email: string;
    userId: string | null;
  }): Promise<number>;
}
