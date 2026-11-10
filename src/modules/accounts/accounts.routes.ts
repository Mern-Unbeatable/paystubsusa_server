import { Router, type RequestHandler } from "express";
import multer from "multer";
import { requirePrincipal } from "../../shared/middleware/require-role.ts";
import { rateLimit } from "../../shared/rate-limit/db-rate-limiter.ts";
import type { RateLimiter } from "../../shared/rate-limit/rate-limiter.ts";
import type { AccountsController } from "./accounts.controller.ts";
import { AVATAR_MAX_BYTES, invalidAvatar } from "./avatar.ts";

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0, parts: 1 },
}).single("avatar");

const parseAvatar: RequestHandler = (req, res, next) => {
  avatarUpload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return next(invalidAvatar(err.code === "LIMIT_FILE_SIZE" ? "Image must be 2 MB or smaller" : "Upload a single image in the avatar field"));
    }
    next(err);
  });
};

export function accountsRoutes(controller: AccountsController, limiter: RateLimiter) {
  const router = Router();
  const self = requirePrincipal("customer", "admin");
  const userKey = (req: Parameters<RequestHandler>[0]) => (req.principal.type === "user" ? req.principal.userId : "");

  router.patch("/me", self, controller.updateProfile);
  router.put(
    "/me/avatar",
    self,
    rateLimit(limiter, (req) => [{ key: `avatar-upload:user:${userKey(req)}`, limit: 20, windowSeconds: 3600 }]),
    parseAvatar,
    controller.uploadAvatar,
  );
  router.delete("/me/avatar", self, controller.removeAvatar);
  router.get("/avatars/:file", controller.getAvatar);
  router.post(
    "/me/password",
    self,
    rateLimit(limiter, (req) => [
      { key: `password-change:user:${userKey(req)}`, limit: 10, windowSeconds: 3600 },
    ]),
    controller.changePassword,
  );

  return router;
}
