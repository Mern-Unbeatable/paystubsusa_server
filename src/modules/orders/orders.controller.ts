import type { Request, Response } from "express";
import { parse } from "../../shared/middleware/validate.ts";
import { ownerPrincipal } from "../../shared/middleware/require-role.ts";
import { requestContext } from "../auth/index.ts";
import type { OrdersService } from "./orders.service.ts";
import type { EntitlementsService } from "./entitlements.service.ts";
import { createOrderBody, listOrdersQuery, orderIdParams, redeemCreditBody } from "./orders.schemas.ts";

export class OrdersController {
  private readonly orders: OrdersService;
  private readonly entitlements: EntitlementsService;

  constructor(orders: OrdersService, entitlements: EntitlementsService) {
    this.orders = orders;
    this.entitlements = entitlements;
  }

  create = async (req: Request, res: Response) => {
    const body = parse(createOrderBody, req.body);
    const result = await this.orders.createOrder(ownerPrincipal(req), body, req.get("idempotency-key")!, {
      ...requestContext(req),
      extraGuestEmail: req.extraGuestEmail,
    });
    res.status(201).json({ data: result });
  };

  get = async (req: Request, res: Response) => {
    const { orderId } = parse(orderIdParams, req.params);
    res.json({ data: await this.orders.get(ownerPrincipal(req), orderId) });
  };

  list = async (req: Request, res: Response) => {
    const { page, pageSize, status } = parse(listOrdersQuery, req.query);
    res.json(await this.orders.list(ownerPrincipal(req), { status }, { page, pageSize }));
  };

  redeemCredit = async (req: Request, res: Response) => {
    res.status(201).json({ data: await this.entitlements.redeem(ownerPrincipal(req), parse(redeemCreditBody, req.body)) });
  };
}
