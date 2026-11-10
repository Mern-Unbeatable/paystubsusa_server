import { Router } from "express";
import type { CatalogController } from "./catalog.controller.ts";

export function catalogRoutes(controller: CatalogController) {
  const router = Router();
  router.get("/catalog/products", controller.products);
  router.get("/catalog/templates", controller.templates);
  router.post("/catalog/quote", controller.quote);
  return router;
}
