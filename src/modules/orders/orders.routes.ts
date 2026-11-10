import { Router } from "express";
import { requirePrincipal } from "../../shared/middleware/require-role.ts";
import { idempotency } from "../../shared/middleware/idempotency.ts";
import type { IdempotencyRepository } from "../../shared/db/idempotency.repository.ts";
import { rateLimit } from "../../shared/rate-limit/db-rate-limiter.ts";
import type { RateLimiter } from "../../shared/rate-limit/rate-limiter.ts";
import type { OrdersController } from "./orders.controller.ts";

export function ordersRoutes(controller: OrdersController, idempotencyRepo: IdempotencyRepository, limiter: RateLimiter) {
  const router = Router();
  const buyer = requirePrincipal("customer", "guest");

  router.post(
    "/orders",
    buyer,
    rateLimit(limiter, (req) => [{ key: `orders:ip:${req.ip}`, limit: 30, windowSeconds: 3600 }]),
    idempotency(idempotencyRepo, "orders.create"),
    controller.create,
  );
  router.get("/orders", buyer, controller.list);
  router.get("/orders/:orderId", requirePrincipal("customer", "guest", "admin"), controller.get);
  router.post("/documents", buyer, controller.redeemCredit);

  return router;
}
