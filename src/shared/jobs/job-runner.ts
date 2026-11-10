import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import type { JobRepository, JobType, ClaimedJob } from "./job.repository.ts";
import { logger } from "../logger.ts";

export interface JobContext {
  attempt: number;
  isFinalAttempt: boolean;
}

/** Handlers must be idempotent: a job can run again after a crash or a retry. */
export type JobHandler = (payload: unknown, ctx: JobContext) => Promise<void>;

const BASE_BACKOFF_MS = 5_000;

export const backoffDelayMs = (attempt: number) => BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);

/** In-process polling worker over the `jobs` table. */
export class JobRunner {
  private readonly workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private timer: NodeJS.Timeout | undefined;
  private inFlight = new Set<Promise<void>>();
  private stopping = false;
  private polling = false;
  private readonly jobs: JobRepository;
  private readonly handlers: Record<JobType, JobHandler>;
  private readonly options: { concurrency: number; pollIntervalMs: number };

  constructor(
    jobs: JobRepository,
    handlers: Record<JobType, JobHandler>,
    options: { concurrency: number; pollIntervalMs: number },
  ) {
    this.jobs = jobs;
    this.handlers = handlers;
    this.options = options;
  }

  start() {
    this.stopping = false;
    this.timer = setInterval(() => void this.poll(), this.options.pollIntervalMs);
    logger.info({ workerId: this.workerId }, "Job runner started");
  }

  async stop() {
    this.stopping = true;
    clearInterval(this.timer);
    await Promise.allSettled([...this.inFlight]);
  }

  /** One claim-and-run cycle; exposed for tests. Resolves when the claimed jobs finish. */
  async poll(): Promise<void> {
    if (this.stopping || this.polling) return;
    this.polling = true;
    try {
      const claimed = await this.jobs.claim(this.workerId, this.options.concurrency - this.inFlight.size);
      const runs = claimed.map((job) => {
        const run = this.execute(job).finally(() => this.inFlight.delete(run));
        this.inFlight.add(run);
        return run;
      });
      this.polling = false;
      await Promise.allSettled(runs);
    } catch (err) {
      logger.error({ err }, "Job poll failed");
    } finally {
      this.polling = false;
    }
  }

  private async execute(job: ClaimedJob) {
    const handler = this.handlers[job.type as JobType];
    const isFinalAttempt = job.attempts >= job.maxAttempts;
    try {
      if (!handler) throw new Error(`No handler for job type "${job.type}"`);
      await handler(job.payload, { attempt: job.attempts, isFinalAttempt });
      await this.jobs.markDone(job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryAt = isFinalAttempt ? null : new Date(Date.now() + backoffDelayMs(job.attempts));
      logger.warn({ jobId: job.id, type: job.type, attempt: job.attempts, final: isFinalAttempt, err: message }, "Job failed");
      await this.jobs.markFailed(job.id, message, retryAt).catch((e: unknown) => logger.error({ err: e }, "markFailed failed"));
    }
  }
}
