import type { Request, Response } from "express";
import { userPrincipal } from "../../../shared/middleware/require-role.ts";
import type { CustomerDashboardService } from "./customer-dashboard.service.ts";

export class CustomerDashboardController {
  private readonly service: CustomerDashboardService;

  constructor(service: CustomerDashboardService) {
    this.service = service;
  }

  get = async (req: Request, res: Response) => {
    res.json({ data: await this.service.get(userPrincipal(req)) });
  };
}
