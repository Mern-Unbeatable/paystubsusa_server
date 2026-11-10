import type { Tx } from "../db/transaction.ts";

export type JobType = "render-document" | "send-email";

export interface ClaimedJob {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export interface JobRepository {
  /** Insert inside the caller's transaction so the job only exists once the business change commits. */
  enqueue(type: JobType, payload: Record<string, unknown>, tx?: Tx, options?: { runAt?: Date; maxAttempts?: number }): Promise<void>;
  /** Atomically moves up to `limit` due jobs to `running` (FOR UPDATE SKIP LOCKED). */
  claim(workerId: string, limit: number): Promise<ClaimedJob[]>;
  markDone(id: string): Promise<void>;
  /** `retryAt` null means attempts are exhausted. */
  markFailed(id: string, error: string, retryAt: Date | null): Promise<void>;
  /** Returns jobs locked longer than `lockedBefore` (crashed worker) to `pending`. */
  recoverStuck(lockedBefore: Date): Promise<number>;
  deleteFinishedBefore(before: Date): Promise<number>;
  countPending(): Promise<number>;
}
