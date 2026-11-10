import { z } from "zod";

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: "Enter a valid email address" }));

export const sendCodeBody = z.object({
  email: emailField,
  purpose: z.enum(["checkout", "document_access"]),
});

export const challengeParams = z.object({ challengeId: z.uuid() });

export const verifyCodeBody = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
