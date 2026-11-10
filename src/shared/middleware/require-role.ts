import type { Request, RequestHandler } from "express";
import { forbidden, unauthorized } from "../http/app-error.ts";
import type { GuestPrincipal, UserPrincipal } from "../types.ts";

type Allowed = "customer" | "admin" | "guest";

/** 401 for anonymous callers, 403 for a principal outside `allowed`. */
export const requirePrincipal =
  (...allowed: Allowed[]): RequestHandler =>
  (req, _res, next) => {
    const p = req.principal;
    if (p.type === "anonymous") throw unauthorized();
    const kind: Allowed = p.type === "guest" ? "guest" : p.role;
    if (!allowed.includes(kind)) throw forbidden();
    next();
  };

/**
 * Re-checks role and status in the database, so suspensions and demotions
 * take effect immediately on admin mutations (the JWT role can be 15 min stale).
 */
export const requireFreshAdmin =
  (loadUser: (id: string) => Promise<{ role: string; status: string } | null>): RequestHandler =>
  async (req, _res, next) => {
    const p = req.principal;
    if (p.type !== "user") throw unauthorized();
    const user = await loadUser(p.userId);
    if (!user || user.role !== "admin" || user.status !== "active") throw forbidden();
    next();
  };

export const userPrincipal = (req: Request): UserPrincipal => {
  if (req.principal.type !== "user") throw unauthorized();
  return req.principal;
};

export const ownerPrincipal = (req: Request): UserPrincipal | GuestPrincipal => {
  if (req.principal.type === "anonymous") throw unauthorized();
  return req.principal;
};
