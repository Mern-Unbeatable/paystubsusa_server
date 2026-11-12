import { z } from "zod";
import { paginationQuery } from "../../shared/http/pagination.ts";
import { emailField } from "../verification/index.ts";

export const contactStatusEnum = z.enum(["new", "handled"]);

export const contactMessageBody = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailField,
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  /** Honeypot: real users never fill it. */
  website: z.string().max(500).optional(),
});

export const listContactMessagesQuery = z.object({
  ...paginationQuery,
  status: contactStatusEnum.optional(),
  /** Matches name, email or subject. */
  q: z.string().trim().max(100).optional(),
});
export const contactMessageParams = z.object({ id: z.uuid() });

const contactFields = {
  name: contactMessageBody.shape.name,
  email: contactMessageBody.shape.email,
  subject: contactMessageBody.shape.subject,
  message: contactMessageBody.shape.message,
};

/** Admin-logged message (e.g. received by phone); no notification email is sent. */
export const createContactMessageBody = z.object({ ...contactFields, status: contactStatusEnum.default("new") }).strict();

export const updateContactMessageBody = z
  .object({
    name: contactFields.name.optional(),
    email: contactFields.email.optional(),
    subject: contactFields.subject.optional(),
    message: contactFields.message.optional(),
    status: contactStatusEnum.optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((v) => v !== undefined), { message: "Nothing to update" });
