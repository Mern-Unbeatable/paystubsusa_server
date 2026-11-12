import type { DocumentType } from "../../generated/prisma/enums.ts";
import { conflict, notFound } from "../../shared/http/app-error.ts";
import { decryptJson, encryptJson } from "../../shared/crypto/encryption.ts";
import { sha256 } from "../../shared/crypto/tokens.ts";
import type { Tx } from "../../shared/db/transaction.ts";
import type { JobRepository } from "../../shared/jobs/job.repository.ts";
import type { JobContext } from "../../shared/jobs/job-runner.ts";
import { toPage, type PageRequest } from "../../shared/http/pagination.ts";
import { canAccessOrder, DOWNLOADABLE_ORDER_STATUSES, scopeOf } from "../../shared/policies/access.ts";
import type { Principal, RequestContext } from "../../shared/types.ts";
import type { ObjectStorage } from "../../integrations/storage.ts";
import type { DocumentRenderer } from "../../integrations/renderer.ts";
import { actorOf, type AuditService } from "../audit/index.ts";
import type { NotificationsService } from "../notifications/notifications.service.ts";
import { env } from "../../config/env.ts";
import { logger } from "../../shared/logger.ts";
import { validateFormData, type DisplayFields } from "./form-data.ts";
import type { DocumentListFilter, DocumentRepository, DocumentWithOrder } from "./repositories/document.repository.ts";

export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

export interface PreparedDocument {
  type: DocumentType;
  display: DisplayFields;
  formDataEnc: Uint8Array<ArrayBuffer>;
  formDataKeyId: string;
}

interface Deps {
  documents: DocumentRepository;
  jobs: JobRepository;
  storage: ObjectStorage;
  renderer: DocumentRenderer;
  audit: AuditService;
  notifications: Pick<NotificationsService, "enqueue">;
}

const toDetail = (d: DocumentWithOrder) => ({
  id: d.id,
  documentNumber: d.documentNumber,
  type: d.type,
  title: d.title,
  employerName: d.employerName,
  recipientName: d.recipientName,
  amountCents: d.amountCents,
  status: d.status,
  createdAt: d.createdAt,
  orderId: d.order.id,
  orderNumber: d.order.orderNumber,
});

export const toAdminDocumentDetail = (d: DocumentWithOrder) => ({
  ...toDetail(d),
  email: d.order.email,
  userId: d.order.userId,
  orderStatus: d.order.status,
  templateId: d.templateId,
  entitlementId: d.entitlementId,
  downloadCount: d.downloadCount,
  renderedAt: d.renderedAt,
  purgedAt: d.purgedAt,
});

export class DocumentsService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  /** Validates, recomputes display values and encrypts the form data (never stored in plaintext). */
  async prepare(type: DocumentType, formData: unknown): Promise<PreparedDocument> {
    const { data, display } = await validateFormData(type, formData);
    const { blob, keyId } = encryptJson(data);
    return { type, display, formDataEnc: blob, formDataKeyId: keyId };
  }

  create(
    input: { orderId: string; templateId: string; entitlementId: string | null; status: "awaiting_payment" | "queued"; prepared: PreparedDocument },
    tx: Tx,
  ) {
    const { prepared } = input;
    return this.d.documents.create(
      {
        orderId: input.orderId,
        entitlementId: input.entitlementId,
        templateId: input.templateId,
        type: prepared.type,
        ...prepared.display,
        formDataEnc: prepared.formDataEnc,
        formDataKeyId: prepared.formDataKeyId,
        status: input.status,
      },
      tx,
    );
  }

  enqueueRender(documentId: string, tx?: Tx) {
    return this.d.jobs.enqueue("render-document", { documentId }, tx, { maxAttempts: 3 });
  }

  /** Paid order: queue every awaiting document and its render job (same transaction). */
  async queueForPaidOrder(orderId: string, tx: Tx) {
    const ids = await this.d.documents.queueAwaitingForOrder(orderId, tx);
    for (const id of ids) await this.enqueueRender(id, tx);
    return ids.length;
  }

  revokeForOrder(orderId: string, tx: Tx) {
    return this.d.documents.revokeForOrder(orderId, tx);
  }

  listByOrder(orderId: string) {
    return this.d.documents.listByOrder(orderId);
  }

  /** My Documents, Find Your Paystubs and the admin list; scoped by principal in SQL. */
  async list(principal: Principal, filter: DocumentListFilter, page: PageRequest) {
    const scope = scopeOf(principal);
    const { items, total } = await this.d.documents.list(scope, filter, page);
    const rows = items.map(({ email, ...row }) => (scope.kind === "admin" ? { ...row, email } : row));
    return toPage(rows, total, page);
  }

  /** Admin customer detail: what the customer sees in My Documents. */
  async listForUser(userId: string, page: PageRequest) {
    const { items, total } = await this.d.documents.list({ kind: "user", userId }, { sort: { field: "createdAt", direction: "desc" } }, page);
    return toPage(items.map(({ email: _email, ...row }) => row), total, page);
  }

  private async loadAccessible(principal: Principal, id: string) {
    const doc = await this.d.documents.findWithOrder(id);
    if (!doc || !canAccessOrder(principal, doc.order)) throw notFound("DOCUMENT_NOT_FOUND", "Document not found");
    // Non-admins only ever see documents of paid orders.
    if (scopeOf(principal).kind !== "admin" && (!DOWNLOADABLE_ORDER_STATUSES.includes(doc.order.status) || doc.status === "revoked")) {
      throw notFound("DOCUMENT_NOT_FOUND", "Document not found");
    }
    return doc;
  }

  async get(principal: Principal, id: string) {
    return toDetail(await this.loadAccessible(principal, id));
  }

  async getForAdmin(principal: Principal, id: string) {
    return toAdminDocumentDetail(await this.loadAccessible(principal, id));
  }

  /** Policy → order paid → document ready → audit → 5-minute pre-signed URL. */
  async download(principal: Principal, id: string, ctx: RequestContext) {
    const doc = await this.loadAccessible(principal, id);
    if (!DOWNLOADABLE_ORDER_STATUSES.includes(doc.order.status)) throw notFound("DOCUMENT_NOT_FOUND", "Document not found");
    if (doc.status !== "ready" || !doc.pdfStorageKey) {
      throw conflict("DOCUMENT_NOT_READY", "This document is still being prepared. Try again in a moment.");
    }
    await this.d.audit.record({
      ...actorOf(principal),
      action: "document.download",
      targetType: "document",
      targetId: doc.id,
      metadata: { orderId: doc.order.id },
      ip: ctx.ip,
    });
    await this.d.documents.incrementDownloads(doc.id);
    const url = await this.d.storage.presignDownload(doc.pdfStorageKey, doc.fileName, DOWNLOAD_URL_TTL_SECONDS);
    return { url, expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000) };
  }

  /** Admin "regenerate": re-render a failed or outdated PDF from the stored form data. */
  async regenerate(principal: Principal, id: string, ctx: RequestContext, tx: Tx) {
    const doc = await this.d.documents.findWithOrder(id);
    if (!doc) throw notFound("DOCUMENT_NOT_FOUND", "Document not found");
    if (!DOWNLOADABLE_ORDER_STATUSES.includes(doc.order.status)) {
      throw conflict("ORDER_NOT_PAID", "Only documents of paid orders can be regenerated");
    }
    if (!(await this.d.documents.requeue(id, tx))) {
      throw conflict("DOCUMENT_NOT_REGENERABLE", "This document can't be regenerated (its form data was purged or it is rendering)");
    }
    await this.enqueueRender(id, tx);
    await this.d.audit.record(
      { ...actorOf(principal), action: "document.regenerate", targetType: "document", targetId: id, ip: ctx.ip },
      tx,
    );
  }

  /** render-document job. Idempotent: anything not queued/rendering is skipped. */
  async render(documentId: string, ctx: JobContext) {
    const doc = await this.d.documents.startRender(documentId);
    if (!doc) return;
    try {
      if (!doc.formDataEnc || !doc.formDataKeyId) throw new Error("Form data is not available");
      const formData = decryptJson(doc.formDataEnc, doc.formDataKeyId);
      const pdf = await this.d.renderer.render({ type: doc.type, template: doc.template, formData });
      const yyyy = doc.createdAt.getUTCFullYear();
      const mm = String(doc.createdAt.getUTCMonth() + 1).padStart(2, "0");
      const key = `documents/${yyyy}/${mm}/${doc.orderId}/${doc.id}.pdf`;
      await this.d.storage.put(key, pdf, "application/pdf");
      await this.d.documents.markReady(doc.id, key, sha256(pdf));
      if (!doc.renderedAt) await this.emailFirstRender(doc.id);
    } catch (err) {
      if (ctx.isFinalAttempt) {
        await this.d.documents.markFailed(doc.id);
        await this.d.audit.record({
          actorType: "system",
          action: "document.render_failed",
          targetType: "document",
          targetId: doc.id,
          metadata: { error: err instanceof Error ? err.message.slice(0, 300) : "unknown" },
        });
      }
      throw err;
    }
  }

  /** Sends the PDF to the order's (checkout-verified) email; failures are logged, never block the render. */
  private async emailFirstRender(documentId: string) {
    try {
      const doc = await this.d.documents.findWithOrder(documentId);
      if (!doc?.pdfStorageKey || doc.status !== "ready" || !DOWNLOADABLE_ORDER_STATUSES.includes(doc.order.status)) return;
      await this.d.notifications.enqueue(
        "documents_ready",
        doc.order.email,
        {
          orderNumber: doc.order.orderNumber,
          title: doc.title,
          documentsUrl: `${env.APP_URL}/find-paystubs`,
          file: { storageKey: doc.pdfStorageKey, fileName: doc.fileName },
        },
        { relatedOrderId: doc.order.id },
      );
    } catch (err) {
      logger.warn({ documentId, err: err instanceof Error ? err.message : "unknown" }, "Could not queue the document email");
    }
  }

  countSubscriptionDocumentsSince(userId: string, productCode: string, since: Date) {
    return this.d.documents.countSubscriptionDocumentsSince(userId, productCode, since);
  }

  /** [DECISION] 5: purge form data N days after rendering; guest PDFs are deleted after a year. */
  async applyRetention(now: Date, formDataDays: number, guestPdfDays: number) {
    const purged = await this.d.documents.purgeFormDataRenderedBefore(new Date(now.getTime() - formDataDays * 86_400_000));
    let deletedPdfs = 0;
    const cutoff = new Date(now.getTime() - guestPdfDays * 86_400_000);
    for (;;) {
      const batch = await this.d.documents.listGuestPdfsBefore(cutoff, 100);
      if (batch.length === 0) break;
      for (const doc of batch) {
        await this.d.storage.delete(doc.pdfStorageKey);
        await this.d.documents.clearPdf(doc.id);
        deletedPdfs++;
      }
    }
    return { purged, deletedPdfs };
  }
}
