import { z } from "zod";
import { paginationQuery } from "../../shared/http/pagination.ts";

export const paymentStatusEnum = z.enum(["requires_payment", "processing", "succeeded", "failed", "refunded", "partially_refunded"]);

export const paymentIdParams = z.object({ paymentId: z.uuid() });

export const listPaymentsQuery = z.object({ ...paginationQuery });

export const adminListPaymentsQuery = z.object({
  ...paginationQuery,
  status: paymentStatusEnum.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().max(100).optional(),
});
