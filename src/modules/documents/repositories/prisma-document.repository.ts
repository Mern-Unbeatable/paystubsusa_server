import type { Prisma } from "../../../generated/prisma/client.ts";
import { dbOf, prisma } from "../../../shared/db/prisma.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import { skipTake, type PageRequest } from "../../../shared/http/pagination.ts";
import { DOWNLOADABLE_ORDER_STATUSES } from "../../../shared/policies/access.ts";
import type {
  DocumentListFilter,
  DocumentRepository,
  DocumentScope,
  NewDocument,
} from "./document.repository.ts";

const orderSelect = { id: true, orderNumber: true, userId: true, email: true, status: true } as const;

function scopeWhere(scope: DocumentScope): Prisma.DocumentWhereInput {
  if (scope.kind === "admin") return {};
  const order: Prisma.OrderWhereInput = { status: { in: [...DOWNLOADABLE_ORDER_STATUSES] } };
  return {
    status: { not: "revoked" },
    order: scope.kind === "user" ? { ...order, userId: scope.userId } : { ...order, email: scope.email },
  };
}

export class PrismaDocumentRepository implements DocumentRepository {
  async create(input: NewDocument, tx?: Tx) {
    const db = dbOf(tx);
    const [{ number } = { number: "" }] = await db.$queryRaw<{ number: string }[]>`
      SELECT 'DOC-' || to_char(now() AT TIME ZONE 'utc', 'YYYY') || '-' || lpad(nextval('document_number_seq')::text, 6, '0') AS number`;
    return db.document.create({
      data: { ...input, documentNumber: number },
      select: { id: true, documentNumber: true, type: true, status: true },
    });
  }

  async queueAwaitingForOrder(orderId: string, tx: Tx) {
    const db = dbOf(tx);
    const docs = await db.document.findMany({ where: { orderId, status: "awaiting_payment" }, select: { id: true } });
    await db.document.updateMany({ where: { orderId, status: "awaiting_payment" }, data: { status: "queued" } });
    return docs.map((d) => d.id);
  }

  async revokeForOrder(orderId: string, tx: Tx) {
    const { count } = await dbOf(tx).document.updateMany({
      where: { orderId, status: { not: "revoked" } },
      data: { status: "revoked" },
    });
    return count;
  }

  findWithOrder(id: string) {
    return prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        documentNumber: true,
        type: true,
        title: true,
        employerName: true,
        recipientName: true,
        amountCents: true,
        status: true,
        fileName: true,
        pdfStorageKey: true,
        downloadCount: true,
        renderedAt: true,
        purgedAt: true,
        createdAt: true,
        templateId: true,
        entitlementId: true,
        order: { select: orderSelect },
      },
    });
  }

  async list(scope: DocumentScope, filter: DocumentListFilter, page: PageRequest) {
    const q = filter.q?.trim();
    const where: Prisma.DocumentWhereInput = {
      AND: [
        scopeWhere(scope),
        filter.type ? { type: filter.type } : {},
        filter.status ? { status: filter.status } : {},
        q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { documentNumber: { contains: q, mode: "insensitive" } },
                { employerName: { contains: q, mode: "insensitive" } },
                { recipientName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: [{ [filter.sort.field]: filter.sort.direction }, { id: "desc" }],
        ...skipTake(page),
        select: {
          id: true,
          documentNumber: true,
          type: true,
          title: true,
          employerName: true,
          recipientName: true,
          amountCents: true,
          status: true,
          createdAt: true,
          orderId: true,
          order: { select: { orderNumber: true, email: true } },
        },
      }),
      prisma.document.count({ where }),
    ]);
    return {
      items: rows.map(({ order, ...d }) => ({ ...d, orderNumber: order.orderNumber, email: order.email })),
      total,
    };
  }

  listByOrder(orderId: string) {
    return prisma.document.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
      select: { id: true, documentNumber: true, type: true, title: true, status: true, createdAt: true },
    });
  }

  async startRender(id: string) {
    const { count } = await prisma.document.updateMany({
      where: { id, status: { in: ["queued", "rendering"] }, purgedAt: null },
      data: { status: "rendering" },
    });
    if (count === 0) return null;
    return prisma.document.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        orderId: true,
        type: true,
        formDataEnc: true,
        formDataKeyId: true,
        createdAt: true,
        renderedAt: true,
        template: { select: { code: true, renderer: true, variant: true } },
      },
    });
  }

  async markReady(id: string, pdfStorageKey: string, pdfSha256: string) {
    await prisma.document.updateMany({
      where: { id, status: "rendering" },
      data: { status: "ready", pdfStorageKey, pdfSha256, renderedAt: new Date() },
    });
  }

  async markFailed(id: string) {
    await prisma.document.updateMany({ where: { id, status: "rendering" }, data: { status: "failed" } });
  }

  async incrementDownloads(id: string) {
    await prisma.document.update({ where: { id }, data: { downloadCount: { increment: 1 } } });
  }

  async requeue(id: string, tx: Tx) {
    const { count } = await dbOf(tx).document.updateMany({
      where: { id, status: { in: ["ready", "failed", "queued"] }, purgedAt: null, formDataEnc: { not: null } },
      data: { status: "queued" },
    });
    return count === 1;
  }

  async purgeFormDataRenderedBefore(before: Date) {
    const { count } = await prisma.document.updateMany({
      where: { renderedAt: { lt: before }, purgedAt: null },
      data: { formDataEnc: null, formDataKeyId: null, purgedAt: new Date() },
    });
    return count;
  }

  async listGuestPdfsBefore(before: Date, limit: number) {
    const rows = await prisma.document.findMany({
      where: { createdAt: { lt: before }, pdfStorageKey: { not: null }, order: { userId: null } },
      select: { id: true, pdfStorageKey: true },
      take: limit,
    });
    return rows.map((r) => ({ id: r.id, pdfStorageKey: r.pdfStorageKey! }));
  }

  async clearPdf(id: string) {
    await prisma.document.update({ where: { id }, data: { pdfStorageKey: null, pdfSha256: null, status: "revoked" } });
  }

  countSubscriptionDocumentsSince(userId: string, productCode: string, since: Date) {
    return prisma.document.count({
      where: { createdAt: { gte: since }, order: { userId, items: { some: { productCode } } } },
    });
  }
}
