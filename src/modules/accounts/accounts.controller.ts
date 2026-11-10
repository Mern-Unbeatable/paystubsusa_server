import type { Request, Response } from "express";
import { parse } from "../../shared/middleware/validate.ts";
import { userPrincipal } from "../../shared/middleware/require-role.ts";
import { requestContext } from "../auth/index.ts";
import type { AccountsService } from "./accounts.service.ts";
import { changePasswordBody, updateProfileBody } from "./accounts.schemas.ts";

export class AccountsController {
  private readonly service: AccountsService;

  constructor(service: AccountsService) {
    this.service = service;
  }

  updateProfile = async (req: Request, res: Response) => {
    res.json({ user: await this.service.updateProfile(userPrincipal(req).userId, parse(updateProfileBody, req.body)) });
  };

  changePassword = async (req: Request, res: Response) => {
    const p = userPrincipal(req);
    await this.service.changePassword(p.userId, parse(changePasswordBody, req.body), p.sessionId, requestContext(req));
    res.status(204).end();
  };
}
