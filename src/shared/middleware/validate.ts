import type { ZodError, ZodType, z } from "zod";
import { validation, type FieldErrors } from "../http/app-error.ts";

export function zodToFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Parses untrusted input into a typed DTO or throws 422 with field errors. */
export function parse<S extends ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw validation(zodToFieldErrors(result.error));
  return result.data;
}
