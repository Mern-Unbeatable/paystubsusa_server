import { prisma } from "./prisma.ts";
import type { TransactionManager, Tx } from "./transaction.ts";

export class PrismaTransactionManager implements TransactionManager {
  run<T>(fn: (tx: Tx) => Promise<T>, options: { timeoutMs?: number } = {}): Promise<T> {
    return prisma.$transaction((client) => fn(client as unknown as Tx), {
      timeout: options.timeoutMs ?? 15_000,
      maxWait: 5_000,
    });
  }

  runExclusive<T>(lockName: string, fn: (tx: Tx) => Promise<T>, options: { timeoutMs?: number } = {}) {
    return prisma.$transaction(
      async (client) => {
        const [row] = await client.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${lockName})) AS locked`;
        if (!row?.locked) return undefined;
        return fn(client as unknown as Tx);
      },
      { timeout: options.timeoutMs ?? 10 * 60_000, maxWait: 5_000 },
    );
  }
}
