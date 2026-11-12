import { Router } from "express";
import type { IdempotencyRepository } from "../../../shared/db/idempotency.repository.ts";
import { idempotency } from "../../../shared/middleware/idempotency.ts";
import { requireFreshAdmin, requirePrincipal } from "../../../shared/middleware/require-role.ts";
import { singleImageUpload } from "../../../shared/http/image-upload.ts";
import type { UserRepository } from "../../auth/index.ts";
import { TEMPLATE_PREVIEW_MAX_BYTES, invalidPreview } from "../../catalog/index.ts";
import type { AdminController } from "./admin.controller.ts";

const parsePreview = singleImageUpload("image", TEMPLATE_PREVIEW_MAX_BYTES, invalidPreview);

export function adminRoutes(c: AdminController, users: UserRepository, idempotencyRepo: IdempotencyRepository) {
  const router = Router();
  router.use("/admin", requirePrincipal("admin"));
  // The JWT role can be 15 min stale; mutations re-check it in the database.
  const fresh = requireFreshAdmin((id) => users.findById(id));

  router.get("/admin/dashboard", c.dashboard);

  router.get("/admin/customers", c.listCustomers);
  router.get("/admin/customers/:id", c.getCustomer);
  router.patch("/admin/customers/:id", fresh, c.updateCustomer);
  router.get("/admin/guest-buyers", c.listGuestBuyers);

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
  router.post("/admin/products", fresh, c.createProduct);
  router.get("/admin/products/:code", c.getProduct);
  router.patch("/admin/products/:code", fresh, c.updateProduct);
  router.delete("/admin/products/:code", fresh, c.deleteProduct);

  router.get("/admin/templates", c.listTemplates);
  router.post("/admin/templates", fresh, c.createTemplate);
  router.get("/admin/templates/:id", c.getTemplate);
  router.patch("/admin/templates/:id", fresh, c.updateTemplate);
  router.delete("/admin/templates/:id", fresh, c.deleteTemplate);
  router.post("/admin/templates/:id/default", fresh, c.setDefaultTemplate);
  // Auth and the fresh-role check run before multer reads the body.
  router.put("/admin/templates/:id/preview", fresh, parsePreview, c.uploadTemplatePreview);
  router.delete("/admin/templates/:id/preview", fresh, c.removeTemplatePreview);

  router.get("/admin/contact-messages", c.listContactMessages);
  router.post("/admin/contact-messages", fresh, c.createContactMessage);
  router.patch("/admin/contact-messages/:id", fresh, c.updateContactMessage);
  router.delete("/admin/contact-messages/:id", fresh, c.deleteContactMessage);
  router.post("/admin/contact-messages/:id/reply", fresh, idempotency(idempotencyRepo, "admin.contact_reply"), c.replyContactMessage);

  router.get("/admin/audit-logs", c.listAuditLogs);

  return router;
}
