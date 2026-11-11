import { z } from "zod";
import { paginationQuery, sortQuery } from "../../../shared/http/pagination.ts";
import { documentTypeEnum } from "../../catalog/index.ts";
import { orderStatusEnum } from "../../orders/index.ts";

const q = z.string().trim().max(100).optional();
const dateFilter = z.coerce.date().optional();

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

export const updateCustomerBody = z
  .object({ status: z.enum(["active", "suspended"]), reason: z.string().trim().max(500).optional() })
  .strict();

export const adminOrdersQuery = z.object({
  ...paginationQuery,
  q,
  status: orderStatusEnum.optional(),
  documentType: documentTypeEnum.optional(),
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

export const updateProductBody = z
  .object({ amountCents: z.number().int().min(50).max(1_000_000).optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((b) => b.amountCents !== undefined || b.isActive !== undefined, { error: "Nothing to update" });

export const adminTemplatesQuery = z.object({ documentType: documentTypeEnum.optional() });

export const updateTemplateBody = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    subtitle: z.string().trim().max(200).nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const auditLogsQuery = z.object({
  ...paginationQuery,
  actorId: z.uuid().optional(),
  action: z.string().trim().max(100).optional(),
  from: dateFilter,
  to: dateFilter,
});
