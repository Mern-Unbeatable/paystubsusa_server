import { z } from "zod";
import { emailField } from "../verification/index.ts";

export const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export const registerBody = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: emailField,
  password: passwordField,
});

export const loginBody = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required").max(128),
  rememberMe: z.boolean().optional().default(false),
});

export const forgotPasswordBody = z.object({ email: emailField });

export const resetPasswordBody = z.object({
  token: z.string().min(10).max(200),
  password: passwordField,
});

export const verifyEmailBody = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
