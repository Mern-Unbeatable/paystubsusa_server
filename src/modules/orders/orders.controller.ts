import type { Request, Response } from "express";
import { parse } from "../../shared/middleware/validate.ts";
import { ownerPrincipal } from "../../shared/middleware/require-role.ts";
import { requestContext } from "../auth/index.ts";
import type { OrdersService } from "./orders.service.ts";
import type { EntitlementsService } from "./entitlements.service.ts";
import { createOrderBody, listOrdersQuery, orderIdParams, redeemCreditBody } from "./orders.schemas.ts";

/** Confirms an unpaid order's payment with the provider when the webhook hasn't arrived. */
export interface PaymentReconciler {
  reconcileOrder(orderId: string): Promise<boolean>;
}

const UNPAID_STATUSES = new Set(["pending_payment", "failed"]);

export class OrdersController {
  private readonly orders: OrdersService;
  private readonly entitlements: EntitlementsService;
  private readonly reconciler: PaymentReconciler;

  constructor(orders: OrdersService, entitlements: EntitlementsService, reconciler: PaymentReconciler) {
    this.orders = orders;
    this.entitlements = entitlements;
    this.reconciler = reconciler;
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
    const principal = ownerPrincipal(req);
    // Access is checked by the first read, before anything is asked of Stripe.
    let order = await this.orders.get(principal, orderId);
    if (UNPAID_STATUSES.has(order.status) && (await this.reconciler.reconcileOrder(orderId))) {
      order = await this.orders.get(principal, orderId);
    }
    res.json({ data: order });
  };

  list = async (req: Request, res: Response) => {
    const { page, pageSize, status } = parse(listOrdersQuery, req.query);
    res.json(await this.orders.list(ownerPrincipal(req), { status }, { page, pageSize }));
  };

  redeemCredit = async (req: Request, res: Response) => {
    res.status(201).json({ data: await this.entitlements.redeem(ownerPrincipal(req), parse(redeemCreditBody, req.body)) });
  };
}
