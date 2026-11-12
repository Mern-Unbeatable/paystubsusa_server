import type { ContactStatus } from "../../generated/prisma/enums.ts";
import { env } from "../../config/env.ts";
import type { TransactionManager } from "../../shared/db/transaction.ts";
import { notFound } from "../../shared/http/app-error.ts";
import { toPage, type PageRequest } from "../../shared/http/pagination.ts";
import type { Principal, RequestContext } from "../../shared/types.ts";
import { actorOf, type AuditService } from "../audit/index.ts";
import type { NotificationsService } from "../notifications/index.ts";
import type { ContactMessageChanges, ContactMessageRepository } from "./repositories/contact-message.repository.ts";

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

  async list(filter: { status?: ContactStatus; q?: string }, page: PageRequest) {
    const { items, total } = await this.messages.list(filter, page);
    return toPage(items, total, page);
  }

  async create(principal: Principal, input: ContactInput & { status: ContactStatus }, ctx: RequestContext) {
    const created = await this.messages.create({ ...input, ip: null });
    await this.audit.record({ ...actorOf(principal), action: "contact_message.create", targetType: "contact_message", targetId: created.id, metadata: { status: created.status }, ip: ctx.ip });
    return created;
  }

  async update(principal: Principal, id: string, changes: ContactMessageChanges, ctx: RequestContext) {
    const updated = await this.messages.update(id, changes);
    if (!updated) throw notFound("CONTACT_MESSAGE_NOT_FOUND", "Message not found");
    // Field names only: the audit log must not copy the customer's message or email.
    const metadata = { fields: Object.keys(changes), ...(changes.status && { status: changes.status }) };
    await this.audit.record({ ...actorOf(principal), action: "contact_message.update", targetType: "contact_message", targetId: id, metadata, ip: ctx.ip });
    return updated;
  }

  /** Emails the reply to the sender and marks the message handled, in one transaction. */
  async reply(principal: Principal, id: string, reply: string, ctx: RequestContext) {
    const found = await this.messages.findById(id);
    if (!found) throw notFound("CONTACT_MESSAGE_NOT_FOUND", "Message not found");
    const updated = await this.tx.run(async (tx) => {
      await this.notifications.enqueue(
        "contact_reply",
        found.email,
        { name: found.name, subject: found.subject, reply, originalMessage: found.message, supportEmail: env.SUPPORT_EMAIL },
        { tx },
      );
      return this.messages.update(id, { status: "handled" }, tx);
    });
    if (!updated) throw notFound("CONTACT_MESSAGE_NOT_FOUND", "Message not found");
    // Length only: the reply text stays out of the audit log.
    await this.audit.record({ ...actorOf(principal), action: "contact_message.reply", targetType: "contact_message", targetId: id, metadata: { replyLength: reply.length }, ip: ctx.ip });
    return updated;
  }

  async remove(principal: Principal, id: string, ctx: RequestContext) {
    if (!(await this.messages.delete(id))) throw notFound("CONTACT_MESSAGE_NOT_FOUND", "Message not found");
    await this.audit.record({ ...actorOf(principal), action: "contact_message.delete", targetType: "contact_message", targetId: id, ip: ctx.ip });
  }
}
