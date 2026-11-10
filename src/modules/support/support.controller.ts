import type { Request, Response } from "express";
import { parse } from "../../shared/middleware/validate.ts";
import { requestContext } from "../auth/index.ts";
import type { SupportService } from "./support.service.ts";
import { contactMessageBody } from "./support.schemas.ts";

export class SupportController {
  private readonly service: SupportService;

  constructor(service: SupportService) {
    this.service = service;
  }

  submit = async (req: Request, res: Response) => {
    const { website, ...input } = parse(contactMessageBody, req.body);
    // Bots get the same 202 so they can't tell they were filtered.
    if (!website) await this.service.submit(input, requestContext(req));
    res.status(202).json({ data: { received: true } });
  };
}
