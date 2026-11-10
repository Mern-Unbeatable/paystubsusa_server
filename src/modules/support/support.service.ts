import type { ContactStatus } from "../../generated/prisma/enums.ts";
import { env } from "../../config/env.ts";
import type { TransactionManager } from "../../shared/db/transaction.ts";
import { notFound } from "../../shared/http/app-error.ts";
import { toPage, type PageRequest } from "../../shared/http/pagination.ts";
import type { Principal, RequestContext } from "../../shared/types.ts";
import { actorOf, type AuditService } from "../audit/index.ts";
import type { NotificationsService } from "../notifications/index.ts";
import type { ContactMessageRepository } from "./repositories/contact-message.repository.ts";

export interface ContactInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export class SupportService {
  private readonly messages: ContactMessageRepository;
  private readonly notifications: NotificationsService;
  private readonly audit: AuditService;
  private readonly tx: TransactionManager;

  constructor(messages: ContactMessageRepository, notifications: NotificationsService, audit: AuditService, tx: TransactionManager) {
    this.messages = messages;
    this.notifications = notifications;
    this.audit = audit;
    this.tx = tx;
  }

  submit(input: ContactInput, ctx: RequestContext) {
    return this.tx.run(async (tx) => {
      await this.messages.create({ ...input, ip: ctx.ip ?? null }, tx);
      await this.notifications.enqueue("contact_notification", env.SUPPORT_EMAIL, input, { tx });
    });
  }

  async list(filter: { status?: ContactStatus }, page: PageRequest) {
    const { items, total } = await this.messages.list(filter, page);
    return toPage(items, total, page);
  }

  async setStatus(principal: Principal, id: string, status: ContactStatus, ctx: RequestContext) {
    const updated = await this.messages.setStatus(id, status);
    if (!updated) throw notFound("CONTACT_MESSAGE_NOT_FOUND", "Message not found");
    await this.audit.record({ ...actorOf(principal), action: "contact_message.update", targetType: "contact_message", targetId: id, metadata: { status }, ip: ctx.ip });
    return updated;
  }
}
