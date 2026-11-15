import type { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../../shared/db/prisma.ts";
import { notFound } from "../../../shared/http/app-error.ts";
import { skipTake, toPage, type PageRequest } from "../../../shared/http/pagination.ts";

/** URL segment → Prisma model used by the Settings inspector. */
export const SYSTEM_TABLES = [
  "audit-logs",
  "jobs",
  "idempotency-keys",
  "entitlements",
  "email-deliveries",
  "verification-challenges",
  "webhook-events",
  "order-items",
  "rate-limit-counters",
] as const;

export type SystemTable = (typeof SYSTEM_TABLES)[number];

export type SystemTableFilter = { q?: string };

const JOB_STATUSES = new Set(["pending", "running", "done", "failed"]);
const EMAIL_STATUSES = new Set(["pending", "sent", "failed"]);
const DOCUMENT_TYPES = new Set(["paystub", "w2", "nec1099", "direct_deposit"]);
const CHALLENGE_PURPOSES = new Set(["checkout", "document_access", "email_verification", "password_reset"]);

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const contains = (q: string): { contains: string; mode: "insensitive" } => ({
  contains: q,
  mode: "insensitive",
});

/** Composite PK encoder for rate_limit_counters detail URLs. */
const rateLimitIdOf = (key: string, windowStart: Date | string) => {
  const iso = windowStart instanceof Date ? windowStart.toISOString() : String(windowStart);
  return `${key}|${iso}`;
};

const parseRateLimitId = (id: string) => {
  const sep = id.indexOf("|");
  if (sep <= 0 || sep === id.length - 1) return null;
  const key = id.slice(0, sep);
  const windowStart = new Date(id.slice(sep + 1));
  if (Number.isNaN(windowStart.getTime())) return null;
  return { key, windowStart };
};

/** Keep every key; only redact OTP hashes so the property is still visible. */
function present(table: SystemTable, row: Record<string, unknown>) {
  const record = { ...row };
  if (table === "verification-challenges" && "secretHash" in record) {
    record.secretHash = "[redacted]";
  }
  if (table === "idempotency-keys" && typeof record.key === "string") {
    record.id = record.key;
  }
  if (
    table === "rate-limit-counters" &&
    typeof record.key === "string" &&
    record.windowStart != null
  ) {
    record.id = rateLimitIdOf(record.key, record.windowStart as Date | string);
  }
  return record;
}

export class AdminSystemService {
  async list(table: SystemTable, filter: SystemTableFilter, page: PageRequest) {
    const q = filter.q?.trim() || undefined;
    const { items, total } = await this.query(table, q, page);
    return toPage(
      items.map((row) => present(table, row as Record<string, unknown>)),
      total,
      page,
    );
  }

  async get(table: SystemTable, id: string) {
    const row = await this.findOne(table, id);
    if (!row) throw notFound();
    return present(table, row as Record<string, unknown>);
  }

  private async query(table: SystemTable, q: string | undefined, page: PageRequest) {
    const pageArgs = skipTake(page);
    switch (table) {
      case "audit-logs": {
        const where: Prisma.AuditLogWhereInput = q
          ? {
              OR: [
                { action: contains(q) },
                { targetType: contains(q) },
                { targetId: contains(q) },
                { ip: contains(q) },
                ...(isUuid(q) ? [{ actorId: q }, { id: q }] : []),
              ],
            }
          : {};
        const [items, total] = await Promise.all([
          prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs }),
          prisma.auditLog.count({ where }),
        ]);
        return { items, total };
      }
      case "jobs": {
        const where: Prisma.JobWhereInput = q
          ? {
              OR: [
                { type: contains(q) },
                { lastError: contains(q) },
                { lockedBy: contains(q) },
                ...(JOB_STATUSES.has(q) ? [{ status: q as Prisma.EnumJobStatusFilter["equals"] }] : []),
                ...(isUuid(q) ? [{ id: q }] : []),
              ],
            }
          : {};
        const [items, total] = await Promise.all([
          prisma.job.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs }),
          prisma.job.count({ where }),
        ]);
        return { items, total };
      }
      case "idempotency-keys": {
        const where: Prisma.IdempotencyKeyWhereInput = q
          ? { OR: [{ key: contains(q) }, { scope: contains(q) }, { requestHash: contains(q) }] }
          : {};
        const [items, total] = await Promise.all([
          prisma.idempotencyKey.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs }),
          prisma.idempotencyKey.count({ where }),
        ]);
        return { items, total };
      }
      case "entitlements": {
        const where: Prisma.EntitlementWhereInput = q
          ? {
              OR: [
                ...(DOCUMENT_TYPES.has(q)
                  ? [{ documentType: q as Prisma.EnumDocumentTypeFilter["equals"] }]
                  : []),
                ...(isUuid(q) ? [{ id: q }, { orderId: q }] : []),
              ],
            }
          : {};
        // Empty OR from a non-matching q would mean "match everything"; treat as no results.
        if (q && Array.isArray(where.OR) && where.OR.length === 0) {
          return { items: [], total: 0 };
        }
        const [items, total] = await Promise.all([
          prisma.entitlement.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs }),
          prisma.entitlement.count({ where }),
        ]);
        return { items, total };
      }
      case "email-deliveries": {
        const where: Prisma.EmailDeliveryWhereInput = q
          ? {
              OR: [
                { toEmail: contains(q) },
                { template: contains(q) },
                { lastError: contains(q) },
                { providerMessageId: contains(q) },
                ...(EMAIL_STATUSES.has(q)
                  ? [{ status: q as Prisma.EnumEmailStatusFilter["equals"] }]
                  : []),
                ...(isUuid(q) ? [{ id: q }, { relatedOrderId: q }] : []),
              ],
            }
          : {};
        const [items, total] = await Promise.all([
          prisma.emailDelivery.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs }),
          prisma.emailDelivery.count({ where }),
        ]);
        return { items, total };
      }
      case "verification-challenges": {
        const where: Prisma.VerificationChallengeWhereInput = q
          ? {
              OR: [
                { email: contains(q) },
                { ip: contains(q) },
                ...(CHALLENGE_PURPOSES.has(q)
                  ? [{ purpose: q as Prisma.EnumChallengePurposeFilter["equals"] }]
                  : []),
                ...(isUuid(q) ? [{ id: q }, { userId: q }] : []),
              ],
            }
          : {};
        const [items, total] = await Promise.all([
          prisma.verificationChallenge.findMany({
            where,
            orderBy: { createdAt: "desc" },
            ...pageArgs,
          }),
          prisma.verificationChallenge.count({ where }),
        ]);
        return { items, total };
      }
      case "webhook-events": {
        const where: Prisma.WebhookEventWhereInput = q
          ? { OR: [{ id: contains(q) }, { type: contains(q) }, { error: contains(q) }] }
          : {};
        const [items, total] = await Promise.all([
          prisma.webhookEvent.findMany({ where, orderBy: { receivedAt: "desc" }, ...pageArgs }),
          prisma.webhookEvent.count({ where }),
        ]);
        return { items, total };
      }
      case "order-items": {
        const where: Prisma.OrderItemWhereInput = q
          ? {
              OR: [
                { productCode: contains(q) },
                { name: contains(q) },
                ...(isUuid(q) ? [{ id: q }, { orderId: q }, { productId: q }] : []),
              ],
            }
          : {};
        const [items, total] = await Promise.all([
          prisma.orderItem.findMany({ where, orderBy: { id: "desc" }, ...pageArgs }),
          prisma.orderItem.count({ where }),
        ]);
        return { items, total };
      }
      case "rate-limit-counters": {
        const where: Prisma.RateLimitCounterWhereInput = q
          ? { key: contains(q) }
          : {};
        const [items, total] = await Promise.all([
          prisma.rateLimitCounter.findMany({
            where,
            orderBy: [{ windowStart: "desc" }, { key: "asc" }],
            ...pageArgs,
          }),
          prisma.rateLimitCounter.count({ where }),
        ]);
        return { items, total };
      }
    }
  }

  private findOne(table: SystemTable, id: string) {
    switch (table) {
      case "audit-logs":
        return prisma.auditLog.findUnique({ where: { id } });
      case "jobs":
        return prisma.job.findUnique({ where: { id } });
      case "idempotency-keys":
        return prisma.idempotencyKey.findUnique({ where: { key: id } });
      case "entitlements":
        return prisma.entitlement.findUnique({ where: { id } });
      case "email-deliveries":
        return prisma.emailDelivery.findUnique({ where: { id } });
      case "verification-challenges":
        return prisma.verificationChallenge.findUnique({ where: { id } });
      case "webhook-events":
        return prisma.webhookEvent.findUnique({ where: { id } });
      case "order-items":
        return prisma.orderItem.findUnique({ where: { id } });
      case "rate-limit-counters": {
        const parsed = parseRateLimitId(id);
        if (!parsed) return null;
        return prisma.rateLimitCounter.findUnique({
          where: { key_windowStart: parsed },
        });
      }
    }
  }
}
