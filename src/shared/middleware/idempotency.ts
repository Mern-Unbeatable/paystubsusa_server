import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError, badRequest, conflict } from "../http/app-error.ts";
import { sha256 } from "../crypto/tokens.ts";
import type { IdempotencyRepository } from "../db/idempotency.repository.ts";
import { logger } from "../logger.ts";

const TTL_MS = 24 * 60 * 60 * 1000;
const keySchema = z.uuid();

/**
 * Requires `Idempotency-Key` (UUID). Successful (2xx) responses are stored for 24 h and replayed
 * for the same principal + route + body; failures release the key so the client can retry.
 */
export const idempotency =
  (repo: IdempotencyRepository, scopeName: string): RequestHandler =>
  async (req, res, next) => {
    const raw = req.get("idempotency-key");
    if (!raw || !keySchema.safeParse(raw).success) {
      throw badRequest("IDEMPOTENCY_KEY_REQUIRED", "A UUID Idempotency-Key header is required");
    }

    const p = req.principal;
    const owner = p.type === "user" ? `user:${p.userId}` : p.type === "guest" ? `guest:${p.email}` : "anon";
    const scope = `${scopeName}:${owner}`;
    const key = sha256(`${scope}|${raw}`);
    const requestHash = sha256(`${req.originalUrl}|${JSON.stringify(req.body ?? null)}`);

    let reserved = await repo.reserve(key, scope, requestHash, new Date(Date.now() + TTL_MS));
    if (!reserved) {
      const existing = await repo.find(key);
      if (existing && existing.expiresAt.getTime() < Date.now()) {
        await repo.release(key);
        reserved = await repo.reserve(key, scope, requestHash, new Date(Date.now() + TTL_MS));
      } else if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new AppError("IDEMPOTENCY_KEY_REUSED", 422, "This Idempotency-Key was used with a different request");
        }
        if (!existing.response) throw conflict("IDEMPOTENCY_IN_PROGRESS", "The original request is still being processed");
        res.setHeader("Idempotent-Replayed", "true");
        res.status(existing.response.status).json(existing.response.body);
        return;
      } else {
        reserved = await repo.reserve(key, scope, requestHash, new Date(Date.now() + TTL_MS));
      }
      if (!reserved) throw conflict("IDEMPOTENCY_IN_PROGRESS", "The original request is still being processed");
    }

    let settled = false;
    const send = res.json.bind(res);
    res.json = (body: unknown) => {
      settled = true;
      if (res.statusCode >= 200 && res.statusCode < 300) {
        repo
          .complete(key, { status: res.statusCode, body })
          .then(() => send(body))
          .catch((err: unknown) => {
            logger.error({ err, requestId: req.id }, "Failed to store idempotent response");
            send(body);
          });
      } else {
        repo.release(key).catch((err: unknown) => logger.error({ err }, "Failed to release idempotency key"));
        send(body);
      }
      return res;
    };
    res.on("close", () => {
      if (!settled) repo.release(key).catch(() => undefined);
    });

    next();
  };
