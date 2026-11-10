import { Router } from "express";
import { rateLimit } from "../../shared/rate-limit/db-rate-limiter.ts";
import type { RateLimiter } from "../../shared/rate-limit/rate-limiter.ts";
import type { SupportController } from "./support.controller.ts";

export function supportRoutes(controller: SupportController, limiter: RateLimiter) {
  const router = Router();
  router.post(
    "/contact-messages",
    rateLimit(limiter, (req) => [{ key: `contact:ip:${req.ip}`, limit: 5, windowSeconds: 3600 }]),
    controller.submit,
  );
  return router;
}
