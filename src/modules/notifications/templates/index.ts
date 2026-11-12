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
const cardLayout = (title: string, bodyHtml: string, iconHtml = "") =>
  `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f7">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 12px"><tr><td align="center">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;font-family:Arial,Helvetica,sans-serif;text-align:center">` +
  `<tr><td style="padding:40px 40px 0"><img src="${LOGO_URL}" width="200" height="73" alt="Paystubs USA" style="display:inline-block;width:200px;max-width:100%;height:auto;border:0"></td></tr>` +
  `<tr><td style="padding:40px 40px 0">${iconHtml}<h1 style="margin:0 0 16px;font-size:22px;color:#111827">${esc(title)}</h1>${bodyHtml}</td></tr>` +
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
      html: cardLayout(
        "Your verification code",
        `<p style="margin:0 0 24px;font-size:15px;line-height:22px;color:#1f2937">Enter this code in the browser window where you started, to ${why} with Paystubs USA.</p>` +
          `<div style="background:#eff1f0;border-radius:12px;padding:28px 16px;font-size:34px;font-weight:700;letter-spacing:6px;color:#111827">${esc(p.code)}</div>` +
          `<p style="margin:24px 0 0;font-size:14px;line-height:21px;color:#6b7280">If you didn't request this code, please disregard this email. The code will remain active for 10 minutes.</p>`,
      ),
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

  order_receipt: (p: {
    orderNumber: string;
    totalCents: number;
    paidAt?: string;
    billedTo?: string;
    cardBrand?: string | null;
    cardLast4?: string | null;
    receiptUrl?: string | null;
    generatorUrl?: string;
    documentsUrl: string;
    lines: { name: string; quantity: number; amountCents: number }[];
  }): Rendered => {
    const paidOn = new Date(p.paidAt ?? Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    const cell = "padding:10px 20px;border-top:1px solid #e5e7eb";
    const label = "font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px";
    const value = "margin-top:4px;font-size:14px;font-weight:700;color:#111827;word-break:break-all";
    const method = p.cardLast4 ? `${p.cardBrand ? p.cardBrand[0]!.toUpperCase() + p.cardBrand.slice(1) : "Card"} &bull;&bull;&bull;&bull; ${esc(p.cardLast4)}` : "Card";
    const receiptUrl = p.receiptUrl?.startsWith("https://") ? p.receiptUrl : null;
    const second = receiptUrl
      ? { href: receiptUrl, text: "View Invoice" }
      : p.generatorUrl
        ? { href: p.generatorUrl, text: "Create Another Paystub" }
        : null;
    const meta = [
      ["Invoice no.", esc(p.orderNumber)],
      ["Date paid", paidOn],
      ...(p.billedTo ? [["Billed to", esc(p.billedTo)]] : []),
      ["Payment method", method],
    ];
    const metaRows = [];
    for (let i = 0; i < meta.length; i += 2) {
      metaRows.push(
        `<tr>` +
          meta
            .slice(i, i + 2)
            .map(([k, v]) => `<td width="50%" valign="top" style="padding:0 20px 14px"><div style="${label}">${k}</div><div style="${value}">${v}</div></td>`)
            .join("") +
          `</tr>`,
      );
    }
    const steps = [
      "Click <b>View My Documents</b> below.",
      "Sign in, or confirm this email address with a one-time code.",
      "Download your documents as print-ready PDFs.",
    ];
    return {
      subject: `Your Paystubs USA order ${p.orderNumber}`,
      text:
        `Payment successful. Thanks for your purchase.\n\nInvoice: ${p.orderNumber}\nDate paid: ${paidOn}\n` +
        (p.billedTo ? `Billed to: ${p.billedTo}\n` : "") +
        `\n` +
        p.lines.map((l) => `${l.quantity} × ${l.name}: ${money(l.amountCents)}`).join("\n") +
        `\nTotal paid: ${money(p.totalCents)}\n\nView your documents: ${p.documentsUrl}\n(You'll be asked to sign in or confirm your email.)` +
        (second ? `\n${second.text}: ${second.href}` : ""),
      html: cardLayout(
        "Payment successful",
        `<p style="margin:0 0 28px;font-size:15px;line-height:22px;color:#1f2937">Thanks for your purchase! Here is your invoice. We're preparing your documents, and they'll be ready to download in a moment.</p>` +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;text-align:left;font-size:14px;color:#1f2937;border-collapse:separate">` +
          `<tr><td style="padding:18px 20px;border-bottom:1px solid #e5e7eb;border-radius:12px 0 0 0;background:#f9fafb;font-size:18px;font-weight:700;color:#092258;letter-spacing:1px">INVOICE</td>` +
          `<td align="right" style="padding:18px 20px;border-bottom:1px solid #e5e7eb;border-radius:0 12px 0 0;background:#f9fafb"><span style="display:inline-block;padding:4px 12px;background:#dcfce7;border-radius:999px;font-size:12px;font-weight:700;color:#15803d">PAID</span></td></tr>` +
          `<tr><td colspan="2" style="padding:18px 0 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${metaRows.join("")}</table></td></tr>` +
          `<tr><td style="padding:10px 20px;border-top:1px solid #e5e7eb;${label}">Description</td><td align="right" style="padding:10px 20px;border-top:1px solid #e5e7eb;${label}">Amount</td></tr>` +
          p.lines
            .map(
              (l) =>
                `<tr><td style="${cell}">${esc(l.name)}${l.quantity > 1 ? ` <span style="color:#6b7280">&times; ${l.quantity}</span>` : ""}</td>` +
                `<td align="right" style="${cell}">${money(l.amountCents)}</td></tr>`,
            )
            .join("") +
          `<tr><td style="padding:16px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 0 12px;font-weight:700;font-size:16px">Total paid</td>` +
          `<td align="right" style="padding:16px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 0;font-weight:700;font-size:18px;color:#092258">${money(p.totalCents)}</td></tr></table>` +
          `<div style="margin:22px 0 0;text-align:center">` +
          `<a href="${esc(p.documentsUrl)}" target="_blank" style="display:inline-block;margin:6px;padding:12px 24px;background:#092258;border:2px solid #092258;border-radius:10px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">View My Documents</a>` +
          (second
            ? `<a href="${esc(second.href)}" target="_blank" style="display:inline-block;margin:6px;padding:12px 24px;background:#ffffff;border:2px solid #092258;border-radius:10px;font-size:15px;font-weight:700;color:#092258;text-decoration:none">${second.text}</a>`
            : "") +
          `</div>` +
          `<div style="margin:28px 0 0;padding:18px 20px;background:#eff6ff;border-radius:12px;text-align:left">` +
          `<div style="margin:0 0 10px;font-size:14px;font-weight:700;color:#092258">How to get your documents</div>` +
          steps
            .map(
              (s, i) =>
                `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px"><tr>` +
                `<td valign="top" style="width:22px"><div style="width:22px;height:22px;background:#092258;border-radius:11px;color:#ffffff;font-size:12px;font-weight:700;text-align:center;line-height:22px">${i + 1}</div></td>` +
                `<td style="padding:0 0 0 10px;font-size:14px;line-height:22px;color:#1f2937">${s}</td></tr></table>`,
            )
            .join("") +
          `</div>` +
          `<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:#6b7280">Keep this email for your records. You can come back to your documents any time using the link above.</p>`,
        `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 16px"><tr>` +
          `<td style="width:56px;height:56px;background:#dcfce7;border-radius:28px;text-align:center;line-height:56px;font-size:28px;font-weight:700;color:#16a34a">&#10003;</td></tr></table>`,
      ),
      tag: "order-receipt",
    };
  },

  contact_notification: (p: { name: string; email: string; subject: string; message: string }): Rendered => ({
    subject: `[Contact] ${p.subject}`,
    text: `From: ${p.name} <${p.email}>\n\n${p.message}`,
    html: layout("New contact message", `<p>From: ${esc(p.name)} &lt;${esc(p.email)}&gt;</p><p><b>${esc(p.subject)}</b></p><pre style="white-space:pre-wrap">${esc(p.message)}</pre>`),
    tag: "contact",
  }),
} as const;

export type EmailTemplateName = keyof typeof emailTemplates;
export type EmailPayload<T extends EmailTemplateName> = Parameters<(typeof emailTemplates)[T]>[0];
