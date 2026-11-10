import type { SubscriptionStatus } from "../../../generated/prisma/enums.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import type { PageRequest } from "../../../shared/http/pagination.ts";

export interface SubscriptionRow {
  id: string;
  userId: string;
  productId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  createdAt: Date;
}

export interface SubscriptionDetail extends SubscriptionRow {
  user: { id: string; name: string; email: string };
  product: { code: string; name: string; amountCents: number; currency: string; interval: string | null };
}

export interface SubscriptionUpsert {
  userId: string;
  productId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
}

export interface SubscriptionRepository {
  upsert(input: SubscriptionUpsert, tx?: Tx): Promise<SubscriptionRow>;
  findByStripeId(stripeSubscriptionId: string, tx?: Tx): Promise<SubscriptionRow | null>;
  /** active or past_due (Stripe dunning grace period). */
  findActiveForUser(userId: string): Promise<SubscriptionRow | null>;
  latestForUser(userId: string): Promise<SubscriptionDetail | null>;
  findDetail(id: string): Promise<SubscriptionDetail | null>;
  list(filter: { status?: SubscriptionStatus; q?: string }, page: PageRequest): Promise<{ items: SubscriptionDetail[]; total: number }>;
  /** Documents created by the user on Unlimited orders during the subscription. */
  documentsGenerated(sub: SubscriptionRow): Promise<number>;
}
