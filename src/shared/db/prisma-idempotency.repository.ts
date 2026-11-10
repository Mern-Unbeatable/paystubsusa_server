import type { Prisma } from "../../generated/prisma/client.ts";
import { prisma } from "./prisma.ts";
import type { IdempotencyRecord, IdempotencyRepository, StoredResponse } from "./idempotency.repository.ts";

export class PrismaIdempotencyRepository implements IdempotencyRepository {
  async reserve(key: string, scope: string, requestHash: string, expiresAt: Date) {
    const inserted = await prisma.$executeRaw`
      INSERT INTO idempotency_keys (key, scope, request_hash, expires_at)
      VALUES (${key}, ${scope}, ${requestHash}, ${expiresAt})
      ON CONFLICT (key) DO NOTHING`;
    return inserted === 1;
  }

  async find(key: string): Promise<IdempotencyRecord | null> {
    const row = await prisma.idempotencyKey.findUnique({ where: { key } });
    if (!row) return null;
    return {
      key: row.key,
      requestHash: row.requestHash,
      response: row.response as StoredResponse | null,
      expiresAt: row.expiresAt,
    };
  }

  async complete(key: string, response: StoredResponse) {
    await prisma.idempotencyKey.update({
      where: { key },
      data: { response: response as unknown as Prisma.InputJsonValue },
    });
  }

  async release(key: string) {
    await prisma.idempotencyKey.deleteMany({ where: { key } });
  }

  async deleteExpired(now: Date) {
    return (await prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } })).count;
  }
}
