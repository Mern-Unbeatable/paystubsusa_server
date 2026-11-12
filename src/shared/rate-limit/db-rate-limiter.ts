import type { RequestHandler, Request } from "express";
import { env } from "../../config/env.ts";
import { prisma } from "../db/prisma.ts";
import { tooManyRequests } from "../http/app-error.ts";
import type { RateLimiter, RateLimitResult, RateRule } from "./rate-limiter.ts";

/** Fixed-window counters in `rate_limit_counters`; consistent across API instances. */
export class DbRateLimiter implements RateLimiter {
  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const windowMs = windowSeconds * 1000;
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO rate_limit_counters (key, window_start, count) VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_counters.count + 1
      RETURNING count`;
    const count = row?.count ?? 1;
    return {
      allowed: count <= limit,
      count,
      retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000)),
    };
  }

  /** Windows are at most 24 h long, so anything older is dead. */
  async deleteWindowsBefore(before: Date) {
    const { count } = await prisma.rateLimitCounter.deleteMany({ where: { windowStart: { lt: before } } });
    return count;
  }
}

/**
 * Applies every rule produced for the request; the first tripped rule wins.
 * Rules returning no key (e.g. missing email) are skipped; validation rejects those later.
 */
export const rateLimit =
  (limiter: RateLimiter, rules: (req: Request) => (RateRule | null)[]): RequestHandler =>
  async (req, _res, next) => {
    if (!env.RATE_LIMIT_ENABLED) return next();
    for (const rule of rules(req)) {
      if (!rule) continue;
      const result = await limiter.hit(rule.key, rule.limit, rule.windowSeconds);
      if (!result.allowed) throw tooManyRequests(result.retryAfterSeconds, rule.code);
    }
    next();
  };

export const bodyEmail = (req: Request): string | null => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" && email.length <= 254 ? email.trim().toLowerCase() : null;
};
