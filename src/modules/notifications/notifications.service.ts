import type { Mailer } from "../../integrations/mailer.ts";
import type { ObjectStorage } from "../../integrations/storage.ts";
import type { Tx } from "../../shared/db/transaction.ts";
import type { JobRepository } from "../../shared/jobs/job.repository.ts";
import type { JobContext } from "../../shared/jobs/job-runner.ts";
import { emailTemplates, type EmailPayload, type EmailTemplateName } from "./templates/index.ts";
import type { EmailDeliveryRepository } from "./repositories/email-delivery.repository.ts";

interface Deps {
  deliveries: EmailDeliveryRepository;
  jobs: JobRepository;
  mailer: Mailer;
  storage: ObjectStorage;
}

export class NotificationsService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  /** Outbox write: the delivery row and its job commit with the caller's transaction. */
  async enqueue<T extends EmailTemplateName>(
    template: T,
    to: string,
    payload: EmailPayload<T>,
    options: { relatedOrderId?: string | null; tx?: Tx } = {},
  ) {
    const id = await this.d.deliveries.create(
      { toEmail: to, template, payload: payload as Record<string, unknown>, relatedOrderId: options.relatedOrderId },
      options.tx,
    );
    await this.d.jobs.enqueue("send-email", { deliveryId: id }, options.tx, { maxAttempts: 5 });
  }

  /** send-email job handler. Idempotent: already-sent or failed deliveries are skipped. */
  async deliver(deliveryId: string, ctx: JobContext) {
    const delivery = await this.d.deliveries.findById(deliveryId);
    if (!delivery || delivery.status !== "pending") return;

    const render = emailTemplates[delivery.template as EmailTemplateName] as ((p: unknown) => ReturnType<(typeof emailTemplates)[EmailTemplateName]>) | undefined;
    if (!render) {
      await this.d.deliveries.markAttemptFailed(deliveryId, `Unknown template ${delivery.template}`, true);
      return;
    }

    try {
      const { attachments, ...email } = render(delivery.payload);
      const files = [];
      for (const a of attachments ?? []) {
        const content = await this.d.storage.get(a.storageKey);
        if (!content) throw new Error(`Attachment ${a.fileName} is missing from storage`);
        files.push({ filename: a.fileName, content, contentType: "application/pdf" });
      }
      const { providerMessageId } = await this.d.mailer.send({ to: delivery.toEmail, ...email, attachments: files.length ? files : undefined });
      await this.d.deliveries.markSent(deliveryId, providerMessageId);
    } catch (err) {
      await this.d.deliveries.markAttemptFailed(deliveryId, err instanceof Error ? err.message : String(err), ctx.isFinalAttempt);
      throw err;
    }
  }
}
