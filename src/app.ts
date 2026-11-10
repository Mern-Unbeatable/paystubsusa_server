import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { z } from "zod";
import { env, isProduction } from "./config/env.ts";
import type { Container } from "./container.ts";
import { LocalStorage } from "./integrations/storage.ts";
import { logger } from "./shared/logger.ts";
import { requestId } from "./shared/middleware/request-id.ts";
import { authenticate } from "./shared/middleware/authenticate.ts";
import { globalApiLimiter } from "./shared/rate-limit/memory-rate-limiter.ts";
import { errorHandler, notFoundHandler } from "./shared/http/error-handler.ts";
import { parse } from "./shared/middleware/validate.ts";
import { notFound } from "./shared/http/app-error.ts";
import { authRoutes } from "./modules/auth/index.ts";
import { accountsRoutes } from "./modules/accounts/index.ts";
import { verificationRoutes } from "./modules/verification/index.ts";
import { catalogRoutes } from "./modules/catalog/index.ts";
import { documentsRoutes } from "./modules/documents/index.ts";
import { ordersRoutes } from "./modules/orders/index.ts";
import { paymentsRoutes, webhookRoutes } from "./modules/payments/index.ts";
import { subscriptionsRoutes } from "./modules/subscriptions/index.ts";
import { supportRoutes } from "./modules/support/index.ts";
import { customerDashboardRoutes } from "./modules/dash/customer/index.ts";
import { adminRoutes } from "./modules/dash/admin/index.ts";
import { publicRoutes } from "./modules/public/index.ts";

const localFileQuery = z.object({ key: z.string().min(1).max(300), name: z.string().min(1).max(200), exp: z.coerce.number().int(), sig: z.string().length(64) });

export function createApp(c: Container) {
  const app = express();
  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      autoLogging: { ignore: (req) => req.url === "/healthz" },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
      customSuccessMessage: (req, res, ms) => `${req.method} ${res.statusCode} ${(req as express.Request).originalUrl} | ${ms} ms`,
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true, maxAge: 600 }));

  app.use(publicRoutes(c.checkDatabase));

  const api = express.Router();
  // Raw body for the Stripe signature; before the JSON parser and the per-IP limiter (Stripe bursts).
  api.use(webhookRoutes(c.controllers.payments));
  api.use(globalApiLimiter);
  api.use(express.json({ limit: "4mb" }));
  api.use(cookieParser());
  api.use(authenticate);

  const { limiter, idempotency, users } = c.repositories;
  api.use(authRoutes(c.controllers.auth, limiter, env.CORS_ORIGINS));
  api.use(accountsRoutes(c.controllers.accounts, limiter));
  api.use(verificationRoutes(c.controllers.verification, limiter));
  api.use(catalogRoutes(c.controllers.catalog));
  api.use(ordersRoutes(c.controllers.orders, idempotency, limiter));
  api.use(documentsRoutes(c.controllers.documents));
  api.use(paymentsRoutes(c.controllers.payments));
  api.use(subscriptionsRoutes(c.controllers.subscriptions));
  api.use(customerDashboardRoutes(c.controllers.customerDashboard));
  api.use(supportRoutes(c.controllers.support, limiter));
  api.use(adminRoutes(c.controllers.admin, users, idempotency));

  const storage = c.integrations.storage;
  if (!isProduction && storage instanceof LocalStorage) {
    api.get("/local-files", async (req, res) => {
      const q = parse(localFileQuery, req.query);
      const file = await storage.read(q.key, q.name, q.exp, q.sig).catch(() => null);
      if (!file) throw notFound();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", file.disposition);
      res.send(file.body);
    });
  }

  app.use("/api/v1", api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
