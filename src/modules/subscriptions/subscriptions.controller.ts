import type { Request, Response } from "express";
import { userPrincipal } from "../../shared/middleware/require-role.ts";
import type { SubscriptionsService } from "./subscriptions.service.ts";

export class SubscriptionsController {
  private readonly service: SubscriptionsService;

  constructor(service: SubscriptionsService) {
    this.service = service;
  }

  mine = async (req: Request, res: Response) => {
    res.json({ data: await this.service.getMine(userPrincipal(req).userId) });
  };

  checkout = async (req: Request, res: Response) => {
    res.status(201).json({ data: await this.service.createCheckoutSession(userPrincipal(req).userId) });
  };

  portal = async (req: Request, res: Response) => {
    res.status(201).json({ data: await this.service.createPortalSession(userPrincipal(req).userId) });
  };
}
