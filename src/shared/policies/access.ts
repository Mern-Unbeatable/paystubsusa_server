import { forbidden, unauthorized } from "../http/app-error.ts";
import type { Principal } from "../types.ts";
import type { OrderStatus } from "../../generated/prisma/enums.ts";

export interface OwnedOrder {
  userId: string | null;
  email: string;
}

/** Spec section 13.3. Guest tokens keep email-scoped access after linking ([DECISION] 16). */
export function canAccessOrder(p: Principal, order: OwnedOrder): boolean {
  if (p.type === "user") return p.role === "admin" || order.userId === p.userId;
  if (p.type === "guest") return order.email === p.email;
  return false;
}

export const DOWNLOADABLE_ORDER_STATUSES: readonly OrderStatus[] = ["paid", "partially_refunded"];

/** How list queries are scoped in SQL for a principal. */
export type OwnerScope = { kind: "user"; userId: string } | { kind: "email"; email: string } | { kind: "admin" };

export function scopeOf(p: Principal): OwnerScope {
  if (p.type === "user") return p.role === "admin" ? { kind: "admin" } : { kind: "user", userId: p.userId };
  if (p.type === "guest") return { kind: "email", email: p.email };
  throw unauthorized();
}

export const isAdmin = (p: Principal) => p.type === "user" && p.role === "admin";

export function assertAdmin(p: Principal): void {
  if (!isAdmin(p)) throw forbidden();
}
