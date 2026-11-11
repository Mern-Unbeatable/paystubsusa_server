import { readFileSync } from "node:fs";
import { Router } from "express";
import { logger } from "../../shared/logger.ts";

const pkg = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as {
  name: string;
  version: string;
  description: string;
};

const ABOUT = {
  project: {
    name: "Paystubs USA API",
    package: pkg.name,
    version: pkg.version,
    description: pkg.description,
  },
  developer: {
    name: "Nayem Islam",
    github: "https://github.com/Nayem707",
  },
  endpoints: { api: "/api/v1", health: "/healthz", readiness: "/readyz" },
};

/** `/`: project and developer info. `/healthz`: the process is up. `/readyz`: it can reach the database. */
export function publicRoutes(checkDatabase: () => Promise<void>) {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json(ABOUT);
  });
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
