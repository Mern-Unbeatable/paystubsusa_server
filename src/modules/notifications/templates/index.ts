import type { OutgoingEmail } from "../../../integrations/mailer.ts";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const layout = (title: string, bodyHtml: string) =>
  `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;max-width:560px;margin:auto">` +
  `<h2>${esc(title)}</h2>${bodyHtml}<p style="color:#666;font-size:12px">Paystubs USA</p></body></html>`;

type Rendered = Omit<OutgoingEmail, "to">;

export const emailTemplates = {
  verification_code: (p: { code: string; purpose: "checkout" | "document_access" }): Rendered => {
    const why = p.purpose === "checkout" ? "complete your purchase" : "access your documents";
    return {
      subject: `Your verification code: ${p.code}`,
      text: `Use this code to ${why}: ${p.code}\n\nIt expires in 10 minutes. If you didn't request it, ignore this email.`,
      html: layout("Your verification code", `<p>Use this code to ${why}:</p><p style="font-size:28px;letter-spacing:6px"><b>${esc(p.code)}</b></p><p>It expires in 10 minutes. If you didn't request it, ignore this email.</p>`),
      tag: "verification-code",
    };
  },

  email_verification: (p: { code: string; name: string }): Rendered => ({
    subject: "Verify your email address",
    text: `Hi ${p.name},\n\nYour email verification code is ${p.code}. It expires in 10 minutes.`,
    html: layout("Verify your email", `<p>Hi ${esc(p.name)},</p><p>Your email verification code is <b style="font-size:22px;letter-spacing:4px">${esc(p.code)}</b>. It expires in 10 minutes.</p>`),
    tag: "email-verification",
  }),

  password_reset: (p: { resetUrl: string; name: string }): Rendered => ({
    subject: "Reset your password",
    text: `Hi ${p.name},\n\nReset your password with this link (valid for 30 minutes):\n${p.resetUrl}\n\nIf you didn't request this, ignore this email.`,
    html: layout("Reset your password", `<p>Hi ${esc(p.name)},</p><p><a href="${esc(p.resetUrl)}">Reset your password</a> (valid for 30 minutes).</p><p>If you didn't request this, ignore this email.</p>`),
    tag: "password-reset",
  }),

  order_receipt: (p: { orderNumber: string; totalCents: number; documentsUrl: string; lines: { name: string; quantity: number; amountCents: number }[] }): Rendered => ({
    subject: `Your Paystubs USA order ${p.orderNumber}`,
    text:
      `Thanks for your purchase.\n\nOrder ${p.orderNumber}\n` +
      p.lines.map((l) => `${l.quantity} × ${l.name}: ${money(l.amountCents)}`).join("\n") +
      `\nTotal: ${money(p.totalCents)}\n\nDownload your documents: ${p.documentsUrl}\n(You'll be asked to sign in or confirm your email.)`,
    html: layout(
      "Thanks for your purchase",
      `<p>Order <b>${esc(p.orderNumber)}</b></p><ul>` +
        p.lines.map((l) => `<li>${l.quantity} × ${esc(l.name)}: ${money(l.amountCents)}</li>`).join("") +
        `</ul><p>Total: <b>${money(p.totalCents)}</b></p><p><a href="${esc(p.documentsUrl)}">Download your documents</a> (you'll be asked to sign in or confirm your email).</p>`,
    ),
    tag: "order-receipt",
  }),

  contact_notification: (p: { name: string; email: string; subject: string; message: string }): Rendered => ({
    subject: `[Contact] ${p.subject}`,
    text: `From: ${p.name} <${p.email}>\n\n${p.message}`,
    html: layout("New contact message", `<p>From: ${esc(p.name)} &lt;${esc(p.email)}&gt;</p><p><b>${esc(p.subject)}</b></p><pre style="white-space:pre-wrap">${esc(p.message)}</pre>`),
    tag: "contact",
  }),
} as const;

export type EmailTemplateName = keyof typeof emailTemplates;
export type EmailPayload<T extends EmailTemplateName> = Parameters<(typeof emailTemplates)[T]>[0];
