import express, { Router } from "express";
import { requirePrincipal } from "../../shared/middleware/require-role.ts";
import type { PaymentsController } from "./payments.controller.ts";

/** Mounted before the JSON parser: signature verification needs the raw bytes. */
export function webhookRoutes(controller: PaymentsController) {
  const router = Router();
  router.post("/webhooks/stripe", express.raw({ type: "application/json", limit: "1mb" }), controller.stripeWebhook);
  return router;
}

export function paymentsRoutes(controller: PaymentsController) {
  const router = Router();
  router.get("/payments", requirePrincipal("customer", "guest"), controller.list);
  router.get("/payments/:paymentId", requirePrincipal("customer", "guest", "admin"), controller.get);
  return router;
}
