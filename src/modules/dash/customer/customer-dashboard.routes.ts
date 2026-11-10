import { Router } from "express";
import { requirePrincipal } from "../../../shared/middleware/require-role.ts";
import type { CustomerDashboardController } from "./customer-dashboard.controller.ts";

export function customerDashboardRoutes(controller: CustomerDashboardController) {
  const router = Router();
  router.get("/me/dashboard", requirePrincipal("customer"), controller.get);
  return router;
}
