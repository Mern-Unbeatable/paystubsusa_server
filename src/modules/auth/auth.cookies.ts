import type { CookieOptions, Request, Response } from "express";
import { cookieSecure } from "../../config/env.ts";
import { REMEMBER_ME_TTL_MS } from "./session.service.ts";

export const REFRESH_COOKIE = "rt";

const base: CookieOptions = { httpOnly: true, secure: cookieSecure, sameSite: "lax", path: "/api/v1/auth" };

/** Session cookie unless "remember me"; the server-side expiry applies either way. */
export function setRefreshCookie(res: Response, token: string, rememberMe: boolean) {
  res.cookie(REFRESH_COOKIE, token, rememberMe ? { ...base, maxAge: REMEMBER_ME_TTL_MS } : base);
}

export const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, base);

export const readRefreshCookie = (req: Request): string | undefined => {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === "string" && value.length > 0 && value.length <= 200 ? value : undefined;
};
