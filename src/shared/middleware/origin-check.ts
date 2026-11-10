import type { RequestHandler } from "express";
import { forbidden } from "../http/app-error.ts";

/**
 * CSRF guard for cookie-authenticated endpoints (refresh, logout).
 * Browsers always send Origin on POST; non-browser clients must send X-Requested-With.
 */
export const requireAllowedOrigin =
  (allowedOrigins: string[]): RequestHandler =>
  (req, _res, next) => {
    const origin = req.get("origin");
    if (origin ? !allowedOrigins.includes(origin) : !req.get("x-requested-with")) {
      throw forbidden("ORIGIN_NOT_ALLOWED", "Request origin is not allowed");
    }
    next();
  };
