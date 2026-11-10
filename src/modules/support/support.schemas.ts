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

export const listContactMessagesQuery = z.object({ ...paginationQuery, status: contactStatusEnum.optional() });
export const contactMessageParams = z.object({ id: z.uuid() });
export const updateContactMessageBody = z.object({ status: contactStatusEnum }).strict();
