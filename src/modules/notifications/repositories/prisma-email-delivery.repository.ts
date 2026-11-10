import type { Prisma } from "../../../generated/prisma/client.ts";
import { dbOf, prisma } from "../../../shared/db/prisma.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import type { EmailDeliveryRepository } from "./email-delivery.repository.ts";

export class PrismaEmailDeliveryRepository implements EmailDeliveryRepository {
  async create(
    input: { toEmail: string; template: string; payload: Record<string, unknown>; relatedOrderId?: string | null },
    tx?: Tx,
  ) {
    const row = await dbOf(tx).emailDelivery.create({
      data: {
        toEmail: input.toEmail,
        template: input.template,
        payload: input.payload as Prisma.InputJsonValue,
        relatedOrderId: input.relatedOrderId ?? null,
      },
      select: { id: true },
    });
    return row.id;
  }

  findById(id: string) {
    return prisma.emailDelivery.findUnique({
      where: { id },
      select: { id: true, toEmail: true, template: true, payload: true, status: true, attempts: true },
    });
  }

  async markSent(id: string, providerMessageId: string) {
    await prisma.emailDelivery.update({
      where: { id },
      data: { status: "sent", sentAt: new Date(), providerMessageId, payload: {}, attempts: { increment: 1 }, lastError: null },
    });
  }

  async markAttemptFailed(id: string, error: string, final: boolean) {
    await prisma.emailDelivery.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastError: error.slice(0, 1000),
        ...(final ? { status: "failed" as const, payload: {} } : {}),
      },
    });
  }
}
