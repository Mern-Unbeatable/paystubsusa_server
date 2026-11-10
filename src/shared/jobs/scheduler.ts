import cron, { type ScheduledTask } from "node-cron";
import type { TransactionManager } from "../db/transaction.ts";
import { logger } from "../logger.ts";

export interface ScheduledJob {
  name: string;
  /** Cron expression, UTC. */
  cron: string;
  run: () => Promise<void>;
}

/**
 * node-cron registrations. Each tick takes a Postgres advisory lock named after the task,
 * so only one instance runs it when several API processes are up.
 */
export function startScheduler(tx: TransactionManager, jobs: ScheduledJob[]): () => Promise<void> {
  const tasks: ScheduledTask[] = jobs.map((job) =>
    cron.schedule(
      job.cron,
      async () => {
        try {
          const ran = await tx.runExclusive(`cron:${job.name}`, async () => {
            await job.run();
            return true;
          });
          if (ran) logger.info({ task: job.name }, "Scheduled task finished");
        } catch (err) {
          logger.error({ err, task: job.name }, "Scheduled task failed");
        }
      },
      { name: job.name, timezone: "UTC", noOverlap: true },
    ),
  );
  return async () => {
    await Promise.all(tasks.map((t) => t.stop()));
  };
}
