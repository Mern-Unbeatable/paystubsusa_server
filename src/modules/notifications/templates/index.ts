import type { OutgoingEmail } from "../../../integrations/mailer.ts";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const layout = (title: string, bodyHtml: string) =>
  `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;max-width:560px;margin:auto">` +
  `<h2>${esc(title)}</h2>${bodyHtml}<p style="color:#666;font-size:12px">Paystubs USA</p></body></html>`;

/** 2076×758 with wide transparent side margins; keep the <img> at that ratio. */
const LOGO_URL = "https://raw.githubusercontent.com/Mern-Unbeatable/paystubsusa_frontend/refs/heads/main/src/assets/logo.png";

/** Centered card; tables and inline styles only, since email clients ignore stylesheets and flexbox. */
const cardLayout = (title: string, bodyHtml: string) =>
  `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f7">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 12px"><tr><td align="center">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;font-family:Arial,Helvetica,sans-serif;text-align:center">` +
  `<tr><td style="padding:40px 40px 0"><img src="${LOGO_URL}" width="200" height="73" alt="Paystubs USA" style="display:inline-block;width:200px;max-width:100%;height:auto;border:0"></td></tr>` +
  `<tr><td style="padding:40px 40px 0"><h1 style="margin:0 0 16px;font-size:22px;color:#111827">${esc(title)}</h1>${bodyHtml}</td></tr>` +
  `<tr><td style="padding:40px 40px 32px"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 24px">` +
  `<p style="margin:0 0 12px;font-size:14px;color:#6b7280">Paystubs USA, professional paystubs and tax forms in minutes.</p>` +
  `<p style="margin:0;font-size:12px;color:#9ca3af">&copy; ${new Date().getFullYear()} Paystubs USA. All rights reserved.</p></td></tr>` +
  `</table></td></tr></table></body></html>`;

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
    subject: `${p.code} is your Paystubs USA verification code`,
    text:
      `Hi ${p.name},\n\nWe have received a sign-up attempt with the following code. Enter it in the browser window where you started signing up for Paystubs USA:\n\n${p.code}\n\n` +
      `If you did not attempt to sign up but received this email, please disregard it. The code will remain active for 10 minutes.`,
    html: cardLayout(
      "Verify your Paystubs USA sign-up",
      `<p style="margin:0 0 24px;font-size:15px;line-height:22px;color:#1f2937">Hi ${esc(p.name)}, we have received a sign-up attempt with the following code. Please enter it in the browser window where you started signing up for Paystubs USA.</p>` +
        `<div style="background:#eff1f0;border-radius:12px;padding:28px 16px;font-size:34px;font-weight:700;letter-spacing:6px;color:#111827">${esc(p.code)}</div>` +
        `<p style="margin:24px 0 0;font-size:14px;line-height:21px;color:#6b7280">If you did not attempt to sign up but received this email, please disregard it. The code will remain active for 10 minutes.</p>`,
    ),
    tag: "email-verification",
  }),

  password_reset: (p: { resetUrl: string; name: string }): Rendered => ({
    subject: "Reset your password",
    text:
      `Hi ${p.name},\n\nWe received a request to reset the password for your Paystubs USA account. Open this link to choose a new password:\n\n${p.resetUrl}\n\n` +
      `If you did not request a password reset, please disregard this email. The link will remain active for 30 minutes.`,
    html: cardLayout(
      "Reset your Paystubs USA password",
      `<p style="margin:0 0 24px;font-size:15px;line-height:22px;color:#1f2937">Hi ${esc(p.name)}, we received a request to reset the password for your Paystubs USA account. Click the button below to choose a new password.</p>` +
        `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr><td style="background:#092258;border-radius:10px">` +
        `<a href="${esc(p.resetUrl)}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none">Reset Password</a></td></tr></table>` +
        `<p style="margin:24px 0 8px;font-size:13px;color:#6b7280">If the button doesn't work, copy and paste this link into your browser:</p>` +
        `<p style="margin:0;padding:12px 16px;background:#eff1f0;border-radius:10px;font-size:13px;line-height:19px;word-break:break-all"><a href="${esc(p.resetUrl)}" target="_blank" style="color:#092258">${esc(p.resetUrl)}</a></p>` +
        `<p style="margin:24px 0 0;font-size:14px;line-height:21px;color:#6b7280">If you did not request a password reset, please disregard this email. The link will remain active for 30 minutes.</p>`,
    ),
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
