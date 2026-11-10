export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Counts one hit against `key` in a fixed window of `windowSeconds`. */
  hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

export interface RateRule {
  key: string;
  limit: number;
  windowSeconds: number;
  /** Returned to the client when this rule trips. */
  code?: string;
}
