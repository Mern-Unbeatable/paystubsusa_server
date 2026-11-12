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

/** Orders placed without an account, grouped by (lowercased) email. */
export interface GuestBuyerRow {
  email: string;
  orderCount: number;
  paidOrderCount: number;
  totalSpentCents: number;
  firstOrderAt: Date;
  lastOrderAt: Date;
  /** The email has since registered an account (its earlier guest orders stay unlinked). */
  hasAccount: boolean;
}

export interface GuestBuyerFilter {
  q?: string;
  sort: "lastOrder" | "totalSpent";
}

export interface AdminCustomerRepository {
  /** Customers only; admins are never listed or returned. */
  list(filter: AdminCustomerFilter, page: PageRequest): Promise<{ items: AdminCustomerRow[]; total: number }>;
  find(id: string): Promise<AdminCustomerRow | null>;
  listGuests(filter: GuestBuyerFilter, page: PageRequest): Promise<{ items: GuestBuyerRow[]; total: number }>;
}
