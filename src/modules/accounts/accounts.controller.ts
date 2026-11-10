import type { Request, Response } from "express";
import { parse } from "../../shared/middleware/validate.ts";
import { userPrincipal } from "../../shared/middleware/require-role.ts";
import { notFound } from "../../shared/http/app-error.ts";
import { requestContext } from "../auth/index.ts";
import type { AccountsService } from "./accounts.service.ts";
import { avatarParams, changePasswordBody, updateProfileBody } from "./accounts.schemas.ts";
import { invalidAvatar } from "./avatar.ts";

export class AccountsController {
  private readonly service: AccountsService;

  constructor(service: AccountsService) {
    this.service = service;
  }

  updateProfile = async (req: Request, res: Response) => {
    res.json({ user: await this.service.updateProfile(userPrincipal(req).userId, parse(updateProfileBody, req.body)) });
  };

  uploadAvatar = async (req: Request, res: Response) => {
    if (!req.file) throw invalidAvatar("Choose an image to upload");
    res.json({ user: await this.service.setAvatar(userPrincipal(req).userId, req.file.buffer) });
  };

  removeAvatar = async (req: Request, res: Response) => {
    res.json({ user: await this.service.removeAvatar(userPrincipal(req).userId) });
  };

  /** Public by unguessable key: <img> requests can't carry the in-memory access token. */
  getAvatar = async (req: Request, res: Response) => {
    const { file } = parse(avatarParams, req.params);
    const body = await this.service.getAvatar(`avatars/${file}`);
    if (!body) throw notFound();
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(body);
  };

  changePassword = async (req: Request, res: Response) => {
    const p = userPrincipal(req);
    await this.service.changePassword(p.userId, parse(changePasswordBody, req.body), p.sessionId, requestContext(req));
    res.status(204).end();
  };
}
