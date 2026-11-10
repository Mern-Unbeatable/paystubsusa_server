import { rateLimit } from "express-rate-limit";

// shortcut: per-process memory store, so the effective limit is N× with N instances; the sensitive limits use DbRateLimiter.
export const globalApiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ message: "Too many requests", code: "RATE_LIMITED", requestId: req.id });
  },
});
