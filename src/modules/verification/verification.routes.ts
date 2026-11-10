import { Router } from "express";
import { bodyEmail, rateLimit } from "../../shared/rate-limit/db-rate-limiter.ts";
import type { RateLimiter } from "../../shared/rate-limit/rate-limiter.ts";
import type { VerificationController } from "./verification.controller.ts";
import { RESEND_COOLDOWN_SECONDS } from "./verification.service.ts";

const HOUR = 3600;

export function verificationRoutes(controller: VerificationController, limiter: RateLimiter) {
  const router = Router();

  router.post(
    "/verifications",
    rateLimit(limiter, (req) => {
      const email = bodyEmail(req);
      return [
        { key: "code:global", limit: 2000, windowSeconds: HOUR },
        { key: `code:ip:${req.ip}`, limit: 20, windowSeconds: HOUR },
        email && { key: `code:cooldown:${email}`, limit: 1, windowSeconds: RESEND_COOLDOWN_SECONDS, code: "RESEND_COOLDOWN" },
        email && { key: `code:email:${email}`, limit: 5, windowSeconds: HOUR },
      ].map((r) => r || null);
    }),
    controller.send,
  );

  router.post(
    "/verifications/:challengeId/verify",
    rateLimit(limiter, (req) => [{ key: `code-verify:ip:${req.ip}`, limit: 60, windowSeconds: HOUR }]),
    controller.verify,
  );

  return router;
}
