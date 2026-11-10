import type { Prisma } from "../../generated/prisma/client.ts";
import { dbOf, prisma } from "../db/prisma.ts";
import type { Tx } from "../db/transaction.ts";
import type { ClaimedJob, JobRepository, JobType } from "./job.repository.ts";

export class PrismaJobRepository implements JobRepository {
  async enqueue(
    type: JobType,
    payload: Record<string, unknown>,
    tx?: Tx,
    options: { runAt?: Date; maxAttempts?: number } = {},
  ) {
    await dbOf(tx).job.create({
      data: {
        type,
        payload: payload as Prisma.InputJsonValue,
        runAt: options.runAt ?? new Date(),
        maxAttempts: options.maxAttempts ?? 3,
      },
    });
  }

  async claim(workerId: string, limit: number): Promise<ClaimedJob[]> {
    if (limit <= 0) return [];
    return prisma.$queryRaw<ClaimedJob[]>`
      UPDATE jobs SET status = 'running', locked_at = now(), locked_by = ${workerId},
                      attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT id FROM jobs
        WHERE status = 'pending' AND run_at <= now()
        ORDER BY run_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, type, payload, attempts, max_attempts AS "maxAttempts"`;
  }

  async markDone(id: string) {
    await prisma.job.update({ where: { id }, data: { status: "done", lockedAt: null, lockedBy: null } });
  }

  async markFailed(id: string, error: string, retryAt: Date | null) {
    await prisma.job.update({
      where: { id },
      data: {
        status: retryAt ? "pending" : "failed",
        runAt: retryAt ?? undefined,
        lastError: error.slice(0, 2000),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async recoverStuck(lockedBefore: Date) {
    return (
      await prisma.job.updateMany({
        where: { status: "running", lockedAt: { lt: lockedBefore } },
        data: { status: "pending", lockedAt: null, lockedBy: null },
      })
    ).count;
  }

  async deleteFinishedBefore(before: Date) {
    return (await prisma.job.deleteMany({ where: { status: "done", updatedAt: { lt: before } } })).count;
  }

  countPending() {
    return prisma.job.count({ where: { status: "pending" } });
  }
}
