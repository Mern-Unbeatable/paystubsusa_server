import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get("x-request-id");
  req.id = incoming && SAFE.test(incoming) ? incoming : `req_${randomUUID()}`;
  res.setHeader("X-Request-Id", req.id);
  next();
};
