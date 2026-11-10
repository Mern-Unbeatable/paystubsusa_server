import type { RequestHandler } from "express";
import { unauthorized } from "../http/app-error.ts";
import { verifyAccessToken, verifyGuestToken } from "../crypto/jwt.ts";

/**
 * Resolves exactly one principal per request:
 * `Bearer <access>` → user, `Guest <token>` → guest, nothing → anonymous.
 * An invalid token is a 401 (the SPA refreshes on 401), never a silent downgrade.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  req.principal = { type: "anonymous" };
  const header = req.get("authorization");

  if (header) {
    const [scheme, token] = header.split(" ", 2);
    if (scheme === "Bearer" && token) {
      const claims = await verifyAccessToken(token);
      if (!claims) throw unauthorized("TOKEN_EXPIRED", "Your session expired. Please sign in again.");
      req.principal = { type: "user", userId: claims.userId, role: claims.role, sessionId: claims.sessionId };
    } else if (scheme === "Guest" && token) {
      const claims = await verifyGuestToken(token);
      if (!claims) throw unauthorized("GUEST_TOKEN_INVALID", "Your verification expired. Please verify your email again.");
      req.principal = { type: "guest", email: claims.email };
    } else {
      throw unauthorized("INVALID_AUTHORIZATION", "Unsupported authorization header");
    }
  }

  const extra = req.get("x-guest-token");
  if (extra) {
    const claims = await verifyGuestToken(extra);
    if (!claims) throw unauthorized("GUEST_TOKEN_INVALID", "Your verification expired. Please verify your email again.");
    req.extraGuestEmail = claims.email;
  }

  next();
};
