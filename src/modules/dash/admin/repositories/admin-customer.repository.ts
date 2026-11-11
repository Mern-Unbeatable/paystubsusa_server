import type { SubscriptionStatus, UserStatus } from "../../../../generated/prisma/enums.ts";
import type { PageRequest } from "../../../../shared/http/pagination.ts";

export interface AdminCustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  documentCount: number;
  lifetimeSpendCents: number;
  createdAt: Date;
  lastLoginAt: Date | null;
  /** Status of the current (active or past_due) subscription; null when the customer has none. */
  subscriptionStatus: SubscriptionStatus | null;
}

export interface AdminCustomerFilter {
  q?: string;
  status?: UserStatus;
  subscription?: "active" | "none";
  emailVerified?: "verified" | "unverified";
  sort: "createdAt" | "lifetimeSpend";
}

export interface AdminCustomerRepository {
  /** Customers only; admins are never listed or returned. */
  list(filter: AdminCustomerFilter, page: PageRequest): Promise<{ items: AdminCustomerRow[]; total: number }>;
  find(id: string): Promise<AdminCustomerRow | null>;
}
