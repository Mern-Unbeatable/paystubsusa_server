import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "./app-error.ts";
import { zodToFieldErrors } from "../middleware/validate.ts";
import { logger } from "../logger.ts";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ message: "Route not found", code: "ROUTE_NOT_FOUND", requestId: req.id });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.id;

  if (err instanceof ZodError) {
    res.status(422).json({
      message: "Some submitted data is invalid",
      code: "VALIDATION_ERROR",
      errors: zodToFieldErrors(err),
      requestId,
    });
    return;
  }

  if (err instanceof AppError) {
    const retryAfter = err.details?.["retryAfterSeconds"];
    if (typeof retryAfter === "number") res.setHeader("Retry-After", String(retryAfter));
    if (err.status >= 500) logger.error({ err, requestId }, err.message);
    res.status(err.status).json({
      message: err.message,
      code: err.code,
      ...(err.errors ? { errors: err.errors } : {}),
      ...(err.details ? err.details : {}),
      requestId,
    });
    return;
  }

  // body-parser errors (malformed JSON, payload too large) carry a status and `expose`.
  const status = typeof err?.status === "number" ? err.status : 500;
  if (status < 500 && err?.expose) {
    res.status(status).json({
      message: status === 413 ? "Request body too large" : "Malformed request body",
      code: status === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
      requestId,
    });
    return;
  }

  logger.error({ err, requestId }, "Unhandled error");
  res.status(500).json({ message: "A server error occurred", code: "INTERNAL_ERROR", requestId });
};
