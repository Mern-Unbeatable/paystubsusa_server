import { z } from "zod";
import { paginationQuery } from "../../shared/http/pagination.ts";
import { documentTypeEnum, orderItemsField } from "../catalog/index.ts";

export const orderStatusEnum = z.enum(["pending_payment", "paid", "failed", "canceled", "refunded", "partially_refunded"]);

/** Prices, totals, userId and email in the body are ignored (stripped). */
export const createOrderBody = z.object({
  documentType: documentTypeEnum,
  templateId: z.uuid(),
  items: orderItemsField,
  formData: z.record(z.string(), z.unknown()),
  termsAccepted: z.literal(true, { error: "You must accept the terms" }),
});

export const orderIdParams = z.object({ orderId: z.uuid() });

export const listOrdersQuery = z.object({
  ...paginationQuery,
  status: orderStatusEnum.optional(),
});

export const redeemCreditBody = z.object({
  entitlementId: z.uuid(),
  templateId: z.uuid(),
  formData: z.record(z.string(), z.unknown()),
});
