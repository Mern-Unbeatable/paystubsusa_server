import { Router } from "express";
import { requirePrincipal } from "../../shared/middleware/require-role.ts";
import type { SubscriptionsController } from "./subscriptions.controller.ts";

export function subscriptionsRoutes(controller: SubscriptionsController) {
  const router = Router();
  const customer = requirePrincipal("customer");
  router.get("/me/subscription", customer, controller.mine);
  router.post("/me/subscription/checkout-session", customer, controller.checkout);
  router.post("/me/subscription/portal-session", customer, controller.portal);
  return router;
}
