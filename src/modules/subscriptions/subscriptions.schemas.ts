import { z } from "zod";
import { paginationQuery } from "../../shared/http/pagination.ts";

export const subscriptionStatusEnum = z.enum(["incomplete", "active", "past_due", "canceled", "unpaid"]);

export const listSubscriptionsQuery = z.object({
  ...paginationQuery,
  status: subscriptionStatusEnum.optional(),
  q: z.string().trim().max(100).optional(),
});

export const cancelSubscriptionBody = z.object({ atPeriodEnd: z.boolean() });
