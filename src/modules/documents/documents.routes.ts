import { Router } from "express";
import { requirePrincipal } from "../../shared/middleware/require-role.ts";
import type { DocumentsController } from "./documents.controller.ts";

/** POST /documents (credit redemption) lives in the orders module, which owns entitlements. */
export function documentsRoutes(controller: DocumentsController) {
  const router = Router();
  router.get("/documents", requirePrincipal("customer", "guest"), controller.list);
  router.get("/documents/:documentId", requirePrincipal("customer", "guest", "admin"), controller.get);
  router.post("/documents/:documentId/download", requirePrincipal("customer", "guest", "admin"), controller.download);
  return router;
}
