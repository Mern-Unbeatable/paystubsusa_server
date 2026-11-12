import { z } from "zod";
import { paginationQuery, sortQuery } from "../../../shared/http/pagination.ts";
import { documentTypeEnum, templateVariantField } from "../../catalog/index.ts";
import { orderStatusEnum } from "../../orders/index.ts";

const q = z.string().trim().max(100).optional();
const dateFilter = z.coerce.date().optional();
const activeStatus = z
  .enum(["active", "inactive"])
  .optional()
  .transform((s) => (s === undefined ? undefined : s === "active"));

export const idParams = z.object({ id: z.uuid() });

export const dashboardQuery = z.object({
  range: z.enum(["12m", "6m"]).default("12m").transform((r) => (r === "6m" ? 6 : 12) as 6 | 12),
});

export const customersQuery = z.object({
  ...paginationQuery,
  q,
  status: z.enum(["active", "suspended"]).optional(),
  subscription: z.enum(["active", "none"]).optional(),
  emailVerified: z.enum(["verified", "unverified"]).optional(),
  sort: z.enum(["-createdAt", "-lifetimeSpend"]).default("-createdAt").transform((s) => (s === "-lifetimeSpend" ? "lifetimeSpend" : "createdAt") as "createdAt" | "lifetimeSpend"),
});

export const guestBuyersQuery = z.object({
  ...paginationQuery,
  q,
  sort: z
    .enum(["-lastOrder", "-totalSpent"])
    .default("-lastOrder")
    .transform((s) => (s === "-totalSpent" ? "totalSpent" : "lastOrder") as "lastOrder" | "totalSpent"),
});

export const updateCustomerBody = z
  .object({ status: z.enum(["active", "suspended"]), reason: z.string().trim().max(500).optional() })
  .strict();

export const adminOrdersQuery = z.object({
  ...paginationQuery,
  q,
  status: orderStatusEnum.optional(),
  documentType: documentTypeEnum.optional(),
  buyer: z.enum(["guest", "customer"]).optional(),
  from: dateFilter,
  to: dateFilter,
});

export const refundBody = z
  .object({ amountCents: z.number().int().positive().optional(), reason: z.string().trim().min(1).max(500) })
  .strict();

export const adminDocumentsQuery = z.object({
  ...paginationQuery,
  q,
  type: documentTypeEnum.optional(),
  status: z.enum(["awaiting_payment", "queued", "rendering", "ready", "failed", "revoked"]).optional(),
  sort: sortQuery(["createdAt", "title"], "-createdAt"),
});

export const productParams = z.object({ code: z.string().regex(/^[a-z0-9_]{1,64}$/) });

export const adminProductsQuery = z.object({
  ...paginationQuery,
  q,
  kind: z.enum(["one_time", "subscription"]).optional(),
  documentType: documentTypeEnum.optional(),
  status: activeStatus,
});

const productName = z.string().trim().min(1).max(100);
const productAmount = z.number().int().min(50).max(1_000_000);
const productBadge = z.string().trim().max(40).nullable().transform((b) => b || null);
const productSortOrder = z.number().int().min(0).max(10_000);

export const createProductBody = z
  .object({
    code: z.string().trim().regex(/^[a-z][a-z0-9_]{2,63}$/, { error: "Use 3–64 lowercase letters, digits or underscores" }),
    documentType: documentTypeEnum,
    name: productName,
    amountCents: productAmount,
    creditQuantity: z.number().int().min(1).max(50).default(1),
    badge: productBadge.default(null),
    sortOrder: productSortOrder.default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

export const updateProductBody = z
  .object({
    name: productName.optional(),
    amountCents: productAmount.optional(),
    badge: productBadge.optional(),
    sortOrder: productSortOrder.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), { error: "Nothing to update" });

export const adminTemplatesQuery = z.object({
  ...paginationQuery,
  q,
  documentType: documentTypeEnum.optional(),
  status: activeStatus,
});

const templateTitle = z.string().trim().min(1).max(100);
const templateSubtitle = z.string().trim().max(200).nullable().transform((s) => s || null);
const templateSortOrder = z.number().int().min(0).max(10_000);

export const createTemplateBody = z
  .object({
    code: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,31}$/, { error: "Use 2–32 lowercase letters, digits or hyphens" }),
    documentType: documentTypeEnum,
    renderer: z.string().trim().min(1).max(64),
    variant: templateVariantField.nullable().default(null),
    title: templateTitle,
    subtitle: templateSubtitle.default(null),
    sortOrder: templateSortOrder.default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

export const updateTemplateBody = z
  .object({
    title: templateTitle.optional(),
    subtitle: templateSubtitle.optional(),
    isActive: z.boolean().optional(),
    sortOrder: templateSortOrder.optional(),
    variant: templateVariantField.optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), { error: "Nothing to update" });

export const auditLogsQuery = z.object({
  ...paginationQuery,
  actorId: z.uuid().optional(),
  action: z.string().trim().max(100).optional(),
  from: dateFilter,
  to: dateFilter,
});
