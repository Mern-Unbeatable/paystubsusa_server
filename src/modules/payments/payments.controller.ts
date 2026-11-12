import type { Request, Response } from "express";
import { parse } from "../../shared/middleware/validate.ts";
import { ownerPrincipal } from "../../shared/middleware/require-role.ts";
import type { PaymentsService } from "./payments.service.ts";
import type { WebhookService } from "./webhook.service.ts";
import { listPaymentsQuery, paymentIdParams } from "./payments.schemas.ts";

export class PaymentsController {
  private readonly payments: PaymentsService;
  private readonly webhooks: WebhookService;
  private readonly syncSubscriptions: (userId: string) => Promise<void>;

  /** syncSubscriptions pulls invoice payments from Stripe in case their webhooks never arrived. */
  constructor(payments: PaymentsService, webhooks: WebhookService, syncSubscriptions: (userId: string) => Promise<void>) {
    this.payments = payments;
    this.webhooks = webhooks;
    this.syncSubscriptions = syncSubscriptions;
  }

  list = async (req: Request, res: Response) => {
    const { status, ...page } = parse(listPaymentsQuery, req.query);
    const principal = ownerPrincipal(req);
    if (principal.type === "user") await this.syncSubscriptions(principal.userId);
    res.json(await this.payments.list(principal, { status }, page));
  };

  get = async (req: Request, res: Response) => {
    const { paymentId } = parse(paymentIdParams, req.params);
    res.json({ data: await this.payments.get(ownerPrincipal(req), paymentId) });
  };

  stripeWebhook = async (req: Request, res: Response) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.json({ received: true, ...(await this.webhooks.handle(body, req.get("stripe-signature"))) });
  };
}
