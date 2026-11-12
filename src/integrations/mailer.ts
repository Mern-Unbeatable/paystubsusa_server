import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { env } from "../config/env.ts";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Category label (e.g. "password-reset"); sent as the X-Email-Tag header. */
  tag?: string;
  /** Where "Reply" in the recipient's mail app goes (e.g. the customer who wrote in). */
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/** Mail port; the container picks the implementation, so another provider can be added behind it. */
export interface Mailer {
  /** Throws on failure; the send-email job records the error and retries. */
  send(email: OutgoingEmail): Promise<{ providerMessageId: string }>;
  /** Checks the connection and credentials without sending anything. */
  verify?(): Promise<void>;
}

interface SmtpError {
  code?: string;
  responseCode?: number;
  message?: string;
}

/** Short, credential-free description of an SMTP failure; it is stored on the delivery row. */
export function describeSmtpError(err: unknown) {
  const e = (err ?? {}) as SmtpError;
  const parts = [e.code, e.responseCode].filter(Boolean).join(" ");
  const message = (e.message ?? String(err)).split("\n")[0]!.slice(0, 300);
  return parts ? `SMTP ${parts}: ${message}` : `SMTP error: ${message}`;
}

export class SmtpMailer implements Mailer {
  private readonly transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    // Port 587 starts plain and upgrades; refuse to continue (and send the password) without TLS.
    requireTLS: !env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  async send(email: OutgoingEmail) {
    try {
      const info = await this.transport.sendMail({
        from: env.MAIL_FROM,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        replyTo: email.replyTo,
        headers: email.tag ? { "X-Email-Tag": email.tag } : undefined,
        attachments: email.attachments,
      });
      return { providerMessageId: info.messageId };
    } catch (err) {
      throw new Error(describeSmtpError(err));
    }
  }

  async verify() {
    try {
      await this.transport.verify();
    } catch (err) {
      throw new Error(describeSmtpError(err));
    }
  }
}

/** Development and tests only (env.ts requires smtp in production): writes each email to LOCAL_MAIL_DIR. */
export class FileMailer implements Mailer {
  async send(email: OutgoingEmail) {
    await mkdir(env.LOCAL_MAIL_DIR, { recursive: true });
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeFile(
      path.join(env.LOCAL_MAIL_DIR, `${id}.txt`),
      `To: ${email.to}\nSubject: ${email.subject}\n` +
        (email.attachments?.length ? `Attachments: ${email.attachments.map((a) => a.filename).join(", ")}\n` : "") +
        `\n${email.text}\n`,
      "utf8",
    );
    return { providerMessageId: `file:${id}` };
  }
}
