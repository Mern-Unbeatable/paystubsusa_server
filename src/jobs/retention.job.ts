import type { ScheduledJob } from "../shared/jobs/scheduler.ts";
import { logger } from "../shared/logger.ts";

const DAY = 86_400_000;

/** [DECISION] 5 retention windows. */
export const RETENTION = {
  formDataDays: 30,
  guestPdfDays: 365,
  challengeHours: 24,
  sessionDays: 30,
  webhookPayloadDays: 90,
  finishedJobDays: 14,
  rateLimitHours: 48,
  stuckJobMinutes: 15,
} as const;

export interface MaintenanceDeps {
  applyDocumentRetention: (now: Date, formDataDays: number, guestPdfDays: number) => Promise<unknown>;
  deleteChallengesBefore: (before: Date) => Promise<number>;
  deleteSessionsBefore: (before: Date) => Promise<number>;
  clearWebhookPayloadsBefore: (before: Date) => Promise<number>;
  deleteExpiredIdempotencyKeys: (now: Date) => Promise<number>;
  deleteRateLimitWindowsBefore: (before: Date) => Promise<number>;
  deleteFinishedJobsBefore: (before: Date) => Promise<number>;
  recoverStuckJobs: (lockedBefore: Date) => Promise<number>;
  expireUnpaidOrders: (now: Date) => Promise<number>;
}

/** Every task is idempotent, so a second run on another instance is harmless. */
export function maintenanceJobs(d: MaintenanceDeps): ScheduledJob[] {
  return [
    {
      name: "recover-stuck-jobs",
      cron: "*/5 * * * *",
      run: async () => {
        const n = await d.recoverStuckJobs(new Date(Date.now() - RETENTION.stuckJobMinutes * 60_000));
        if (n) logger.warn({ recovered: n }, "Recovered stuck jobs");
      },
    },
    {
      name: "expire-unpaid-orders",
      cron: "*/15 * * * *",
      run: async () => {
        const n = await d.expireUnpaidOrders(new Date());
        if (n) logger.info({ canceled: n }, "Expired unpaid orders");
      },
    },
    {
      name: "retention",
      cron: "17 3 * * *",
      run: async () => {
        const now = new Date();
        const ago = (ms: number) => new Date(now.getTime() - ms);
        const result = {
          documents: await d.applyDocumentRetention(now, RETENTION.formDataDays, RETENTION.guestPdfDays),
          challenges: await d.deleteChallengesBefore(ago(RETENTION.challengeHours * 3_600_000)),
          sessions: await d.deleteSessionsBefore(ago(RETENTION.sessionDays * DAY)),
          webhookPayloads: await d.clearWebhookPayloadsBefore(ago(RETENTION.webhookPayloadDays * DAY)),
          idempotencyKeys: await d.deleteExpiredIdempotencyKeys(now),
          rateLimitWindows: await d.deleteRateLimitWindowsBefore(ago(RETENTION.rateLimitHours * 3_600_000)),
          finishedJobs: await d.deleteFinishedJobsBefore(ago(RETENTION.finishedJobDays * DAY)),
        };
        logger.info({ result }, "Retention finished");
      },
    },
  ];
}
