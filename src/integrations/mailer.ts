import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { ServerClient } from "postmark";
import { env } from "../config/env.ts";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Postmark message stream; transactional by default. */
  tag?: string;
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<{ providerMessageId: string }>;
}

export class PostmarkMailer implements Mailer {
  private readonly client = new ServerClient(env.POSTMARK_SERVER_TOKEN ?? "");

  async send(email: OutgoingEmail) {
    const result = await this.client.sendEmail({
      From: env.MAIL_FROM,
      To: email.to,
      Subject: email.subject,
      TextBody: email.text,
      HtmlBody: email.html,
      Tag: email.tag,
      MessageStream: "outbound",
    });
    if (result.ErrorCode !== 0) throw new Error(`Postmark error ${result.ErrorCode}: ${result.Message}`);
    return { providerMessageId: result.MessageID };
  }
}

export class SmtpMailer implements Mailer {
  private readonly transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });

  async send(email: OutgoingEmail) {
    const info = await this.transport.sendMail({
      from: env.MAIL_FROM,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return { providerMessageId: info.messageId };
  }
}

/** Development only (env.ts forbids it in production): writes each email to LOCAL_MAIL_DIR. */
export class FileMailer implements Mailer {
  async send(email: OutgoingEmail) {
    await mkdir(env.LOCAL_MAIL_DIR, { recursive: true });
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeFile(
      path.join(env.LOCAL_MAIL_DIR, `${id}.txt`),
      `To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`,
      "utf8",
    );
    return { providerMessageId: `file:${id}` };
  }
}
