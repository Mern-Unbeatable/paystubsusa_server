import type { Request, Response } from "express";
import { parse } from "../../shared/middleware/validate.ts";
import type { VerificationService } from "./verification.service.ts";
import { challengeParams, sendCodeBody, verifyCodeBody } from "./verification.schemas.ts";

export class VerificationController {
  private readonly service: VerificationService;

  constructor(service: VerificationService) {
    this.service = service;
  }

  send = async (req: Request, res: Response) => {
    const { email, purpose } = parse(sendCodeBody, req.body);
    res.status(202).json({ data: await this.service.sendCode(email, purpose, req.ip ?? null) });
  };

  verify = async (req: Request, res: Response) => {
    const { challengeId } = parse(challengeParams, req.params);
    const { code } = parse(verifyCodeBody, req.body);
    res.json({ data: await this.service.verifyCode(challengeId, code) });
  };
}
