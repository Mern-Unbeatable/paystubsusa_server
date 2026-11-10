import { Router } from "express";
import { requirePrincipal } from "../../shared/middleware/require-role.ts";
import { rateLimit } from "../../shared/rate-limit/db-rate-limiter.ts";
import type { RateLimiter } from "../../shared/rate-limit/rate-limiter.ts";
import type { AccountsController } from "./accounts.controller.ts";

export function accountsRoutes(controller: AccountsController, limiter: RateLimiter) {
  const router = Router();
  const self = requirePrincipal("customer", "admin");

  router.patch("/me", self, controller.updateProfile);
  router.post(
    "/me/password",
    self,
    rateLimit(limiter, (req) => [
      { key: `password-change:user:${req.principal.type === "user" ? req.principal.userId : ""}`, limit: 10, windowSeconds: 3600 },
    ]),
    controller.changePassword,
  );

  return router;
}
