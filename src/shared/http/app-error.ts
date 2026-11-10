export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly errors: FieldErrors | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: string,
    status: number,
    message: string,
    options: { errors?: FieldErrors; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.errors = options.errors;
    this.details = options.details;
  }
}

export const badRequest = (code: string, message: string) => new AppError(code, 400, message);
export const unauthorized = (code = "UNAUTHENTICATED", message = "Authentication required") =>
  new AppError(code, 401, message);
export const forbidden = (code = "FORBIDDEN", message = "You do not have permission to perform this action") =>
  new AppError(code, 403, message);
/** Ownership failures also use this, so IDs that exist but aren't yours look missing. */
export const notFound = (code = "NOT_FOUND", message = "Resource not found") => new AppError(code, 404, message);
export const conflict = (code: string, message: string) => new AppError(code, 409, message);
export const validation = (errors: FieldErrors, message = "Some submitted data is invalid") =>
  new AppError("VALIDATION_ERROR", 422, message, { errors });
export const tooManyRequests = (retryAfterSeconds: number, code = "RATE_LIMITED", message = "Too many requests") =>
  new AppError(code, 429, message, { details: { retryAfterSeconds } });
