import { Prisma } from "../../../generated/prisma/client.ts";
import { dbOf, prisma } from "../../../shared/db/prisma.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import type { WebhookEventRepository } from "./webhook-event.repository.ts";

export class PrismaWebhookEventRepository implements WebhookEventRepository {
  async begin(id: string, type: string, payload: unknown) {
    await prisma.webhookEvent.createMany({
      data: [{ id, type, payload: payload as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
    const row = await prisma.webhookEvent.findUnique({ where: { id }, select: { processedAt: true } });
    return !row?.processedAt;
  }

  async markProcessed(id: string, tx: Tx) {
    await dbOf(tx).webhookEvent.update({ where: { id }, data: { processedAt: new Date(), error: null } });
  }

  async markError(id: string, error: string) {
    await prisma.webhookEvent.updateMany({ where: { id }, data: { error: error.slice(0, 2000) } });
  }

  async clearPayloadsBefore(before: Date) {
    const { count } = await prisma.webhookEvent.updateMany({
      where: { receivedAt: { lt: before }, payload: { not: Prisma.DbNull } },
      data: { payload: Prisma.DbNull },
    });
    return count;
  }
}
