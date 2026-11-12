import { Router, type RequestHandler } from "express";
import { singleImageUpload } from "../../shared/http/image-upload.ts";
import { requirePrincipal } from "../../shared/middleware/require-role.ts";
import { rateLimit } from "../../shared/rate-limit/db-rate-limiter.ts";
import type { RateLimiter } from "../../shared/rate-limit/rate-limiter.ts";
import type { AccountsController } from "./accounts.controller.ts";
import { AVATAR_MAX_BYTES, invalidAvatar } from "./avatar.ts";

const parseAvatar = singleImageUpload("avatar", AVATAR_MAX_BYTES, invalidAvatar);

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
