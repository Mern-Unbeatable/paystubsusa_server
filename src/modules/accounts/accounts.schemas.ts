import { z } from "zod";
import { passwordField } from "../auth/index.ts";

export const updateProfileBody = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{6,14}$/, "Enter the phone number in international format, e.g. +15551234567")
      .nullable()
      .optional(),
  })
  .strict();

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
  newPassword: passwordField,
});
