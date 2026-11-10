import { Router } from "express";
import { logger } from "../../shared/logger.ts";

/** `/healthz`: the process is up. `/readyz`: it can reach the database. */
export function publicRoutes(checkDatabase: () => Promise<void>) {
  const router = Router();
  router.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });
  router.get("/readyz", async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: "ready" });
    } catch (err) {
      logger.warn({ err }, "Readiness check failed");
      res.status(503).json({ status: "unavailable" });
    }
  });
  return router;
}
