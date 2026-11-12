import { env } from "./config/env.ts";
import { createApp } from "./app.ts";
import { createContainer } from "./container.ts";
import { prisma } from "./shared/db/prisma.ts";
import { logger } from "./shared/logger.ts";
import { JobRunner } from "./shared/jobs/job-runner.ts";
import { startScheduler } from "./shared/jobs/scheduler.ts";
import { PrismaTransactionManager } from "./shared/db/prisma-transaction-manager.ts";
import { renderDocumentJob } from "./jobs/renderDocument.job.ts";
import { sendEmailJob } from "./jobs/sendEmail.job.ts";
import { maintenanceJobs } from "./jobs/retention.job.ts";

const container = createContainer();
const { services: s, repositories: r } = container;

// Logged, not fatal: a transient SMTP outage must not crash-loop the API; sends retry via the job queue.
container.integrations.mailer
  .verify?.()
  .then(() => logger.info({ host: env.SMTP_HOST }, "SMTP connection verified"))
  .catch((err: unknown) =>
    logger.error(
      {
        host: env.SMTP_HOST,
        reason: err instanceof Error ? err.message : String(err),
      },
      "SMTP verification failed; emails will fail until this is fixed",
    ),
  );

const server = createApp(container).listen(env.PORT, () =>
  logger.info(
    { service: "paystubsusa-api", env: env.NODE_ENV, port: env.PORT },
    "Server started",
  ),
);

const runner = env.JOBS_ENABLED
  ? new JobRunner(
      r.jobs,
      {
        "render-document": renderDocumentJob(s.documents),
        "send-email": sendEmailJob(s.notifications),
      },
      { concurrency: env.RENDER_CONCURRENCY + 2, pollIntervalMs: 1000 },
    )
  : null;
runner?.start();

const stopScheduler = env.SCHEDULER_ENABLED
  ? startScheduler(
      new PrismaTransactionManager(),
      maintenanceJobs({
        applyDocumentRetention: (now, a, b) =>
          s.documents.applyRetention(now, a, b),
        deleteChallengesBefore: (d) => r.challenges.deleteCreatedBefore(d),
        deleteSessionsBefore: (d) => r.refreshSessions.deleteStaleBefore(d),
        clearWebhookPayloadsBefore: (d) =>
          r.webhookEvents.clearPayloadsBefore(d),
        deleteExpiredIdempotencyKeys: (now) => r.idempotency.deleteExpired(now),
        deleteRateLimitWindowsBefore: (d) => r.limiter.deleteWindowsBefore(d),
        deleteFinishedJobsBefore: (d) => r.jobs.deleteFinishedBefore(d),
        recoverStuckJobs: (d) => r.jobs.recoverStuck(d),
        expireUnpaidOrders: (now) => s.orders.expireUnpaid(now),
      }),
    )
  : null;

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");
  const force = setTimeout(() => process.exit(1), 25_000).unref();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await stopScheduler?.();
  await runner?.stop();
  await container.integrations.renderer.close();
  await prisma.$disconnect();
  clearTimeout(force);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (err) =>
  logger.error({ err }, "Unhandled rejection"),
);
