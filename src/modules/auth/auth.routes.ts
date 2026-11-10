import { Router } from "express";
import { requirePrincipal } from "../../shared/middleware/require-role.ts";
import { requireAllowedOrigin } from "../../shared/middleware/origin-check.ts";
import { bodyEmail, rateLimit } from "../../shared/rate-limit/db-rate-limiter.ts";
import type { RateLimiter } from "../../shared/rate-limit/rate-limiter.ts";
import { RESEND_COOLDOWN_SECONDS } from "../verification/index.ts";
import type { AuthController } from "./auth.controller.ts";

const MIN15 = 15 * 60;
const HOUR = 3600;

export function authRoutes(controller: AuthController, limiter: RateLimiter, allowedOrigins: string[]) {
  const router = Router();
  const sameSite = requireAllowedOrigin(allowedOrigins);

  router.post(
    "/auth/register",
    rateLimit(limiter, (req) => [{ key: `register:ip:${req.ip}`, limit: 10, windowSeconds: HOUR }]),
    controller.register,
  );
  router.post(
    "/auth/login",
    rateLimit(limiter, (req) => {
      const email = bodyEmail(req);
      return [
        { key: `login:ip:${req.ip}`, limit: 30, windowSeconds: MIN15 },
        email ? { key: `login:email:${email}`, limit: 10, windowSeconds: MIN15 } : null,
      ];
    }),
    controller.login,
  );
  router.post("/auth/refresh", sameSite, controller.refresh);
  router.post("/auth/logout", sameSite, controller.logout);
  router.get("/auth/me", requirePrincipal("customer", "admin"), controller.me);

  router.post(
    "/auth/password/forgot",
    rateLimit(limiter, (req) => {
      const email = bodyEmail(req);
      return [
        { key: `forgot:ip:${req.ip}`, limit: 20, windowSeconds: HOUR },
        email ? { key: `forgot:email:${email}`, limit: 5, windowSeconds: HOUR } : null,
      ];
    }),
    controller.forgotPassword,
  );
  router.post(
    "/auth/password/reset",
    rateLimit(limiter, (req) => [{ key: `reset:ip:${req.ip}`, limit: 20, windowSeconds: HOUR }]),
    controller.resetPassword,
  );

  router.post(
    "/auth/email/verification",
    requirePrincipal("customer", "admin"),
    rateLimit(limiter, (req) => {
      const id = req.principal.type === "user" ? req.principal.userId : "";
      return [
        { key: `email-verify-send:cooldown:${id}`, limit: 1, windowSeconds: RESEND_COOLDOWN_SECONDS, code: "RESEND_COOLDOWN" },
        { key: `email-verify-send:user:${id}`, limit: 5, windowSeconds: HOUR },
      ];
    }),
    controller.resendVerification,
  );
  router.post(
    "/auth/email/verify",
    requirePrincipal("customer", "admin"),
    rateLimit(limiter, (req) => [{ key: `email-verify:ip:${req.ip}`, limit: 30, windowSeconds: HOUR }]),
    controller.verifyEmail,
  );

  return router;
}
