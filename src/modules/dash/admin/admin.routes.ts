import { Router } from "express";
import type { IdempotencyRepository } from "../../../shared/db/idempotency.repository.ts";
import { idempotency } from "../../../shared/middleware/idempotency.ts";
import { requireFreshAdmin, requirePrincipal } from "../../../shared/middleware/require-role.ts";
import type { UserRepository } from "../../auth/index.ts";
import type { AdminController } from "./admin.controller.ts";

export function adminRoutes(c: AdminController, users: UserRepository, idempotencyRepo: IdempotencyRepository) {
  const router = Router();
  router.use("/admin", requirePrincipal("admin"));
  // The JWT role can be 15 min stale; mutations re-check it in the database.
  const fresh = requireFreshAdmin((id) => users.findById(id));

  router.get("/admin/dashboard", c.dashboard);

  router.get("/admin/customers", c.listCustomers);
  router.get("/admin/customers/:id", c.getCustomer);
  router.patch("/admin/customers/:id", fresh, c.updateCustomer);

  router.get("/admin/orders", c.listOrders);
  router.get("/admin/orders/:id", c.getOrder);
  router.post("/admin/orders/:id/refunds", fresh, idempotency(idempotencyRepo, "admin.refund"), c.refundOrder);

  router.get("/admin/documents", c.listDocuments);
  router.get("/admin/documents/:id", c.getDocument);
  router.post("/admin/documents/:id/download", fresh, c.downloadDocument);
  router.post("/admin/documents/:id/regenerate", fresh, c.regenerateDocument);

  router.get("/admin/payments", c.listPayments);
  router.get("/admin/payments/:id", c.getPayment);

  router.get("/admin/subscriptions", c.listSubscriptions);
  router.get("/admin/subscriptions/:id", c.getSubscription);
  router.post("/admin/subscriptions/:id/cancel", fresh, c.cancelSubscription);

  router.get("/admin/products", c.listProducts);
  router.patch("/admin/products/:code", fresh, c.updateProduct);

  router.get("/admin/templates", c.listTemplates);
  router.patch("/admin/templates/:id", fresh, c.updateTemplate);
  router.post("/admin/templates/:id/default", fresh, c.setDefaultTemplate);

  router.get("/admin/contact-messages", c.listContactMessages);
  router.patch("/admin/contact-messages/:id", fresh, c.updateContactMessage);

  router.get("/admin/audit-logs", c.listAuditLogs);

  return router;
}
