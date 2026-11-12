import type { Request, Response } from "express";
import { parse } from "../../../shared/middleware/validate.ts";
import { userPrincipal } from "../../../shared/middleware/require-role.ts";
import type { AuditService } from "../../audit/index.ts";
import { requestContext } from "../../auth/index.ts";
import { invalidPreview } from "../../catalog/index.ts";
import type { DocumentsService } from "../../documents/index.ts";
import type { OrdersService } from "../../orders/index.ts";
import { adminListPaymentsQuery, type PaymentsService } from "../../payments/index.ts";
import { cancelSubscriptionBody, listSubscriptionsQuery, type SubscriptionsService } from "../../subscriptions/index.ts";
import { createContactMessageBody, listContactMessagesQuery, replyContactMessageBody, updateContactMessageBody, type SupportService } from "../../support/index.ts";
import type { AdminCustomersService } from "./admin-customers.service.ts";
import type { AdminDashboardService } from "./admin-dashboard.service.ts";
import type { AdminOperationsService } from "./admin-operations.service.ts";
import {
  adminDocumentsQuery,
  adminOrdersQuery,
  adminProductsQuery,
  adminTemplatesQuery,
  auditLogsQuery,
  createProductBody,
  createTemplateBody,
  customersQuery,
  dashboardQuery,
  guestBuyersQuery,
  idParams,
  productParams,
  refundBody,
  updateCustomerBody,
  updateProductBody,
  updateTemplateBody,
} from "./admin.schemas.ts";

export interface AdminControllerDeps {
  dashboard: AdminDashboardService;
  customers: AdminCustomersService;
  ops: AdminOperationsService;
  orders: OrdersService;
  documents: DocumentsService;
  payments: PaymentsService;
  subscriptions: SubscriptionsService;
  support: SupportService;
  audit: AuditService;
}

const id = (req: Request) => parse(idParams, req.params).id;

export class AdminController {
  private readonly d: AdminControllerDeps;

  constructor(deps: AdminControllerDeps) {
    this.d = deps;
  }

  dashboard = async (req: Request, res: Response) => {
    const { range } = parse(dashboardQuery, req.query);
    res.json({ data: await this.d.dashboard.get(userPrincipal(req), range) });
  };

  listCustomers = async (req: Request, res: Response) => {
    const { page, pageSize, ...filter } = parse(customersQuery, req.query);
    res.json(await this.d.customers.list(filter, { page, pageSize }));
  };

  listGuestBuyers = async (req: Request, res: Response) => {
    const { page, pageSize, ...filter } = parse(guestBuyersQuery, req.query);
    res.json(await this.d.customers.listGuests(filter, { page, pageSize }));
  };

  getCustomer = async (req: Request, res: Response) => {
    res.json({ data: await this.d.customers.get(id(req)) });
  };

  updateCustomer = async (req: Request, res: Response) => {
    const body = parse(updateCustomerBody, req.body);
    res.json({ data: await this.d.customers.setStatus(userPrincipal(req), id(req), body, requestContext(req)) });
  };

  listOrders = async (req: Request, res: Response) => {
    const { page, pageSize, ...filter } = parse(adminOrdersQuery, req.query);
    res.json(await this.d.orders.list(userPrincipal(req), filter, { page, pageSize }));
  };

  getOrder = async (req: Request, res: Response) => {
    res.json({ data: await this.d.ops.orderDetail(id(req)) });
  };

  refundOrder = async (req: Request, res: Response) => {
    const body = parse(refundBody, req.body);
    const result = await this.d.ops.refund(userPrincipal(req), id(req), body, req.get("idempotency-key")!, requestContext(req));
    res.status(202).json({ data: result });
  };

  listDocuments = async (req: Request, res: Response) => {
    const { page, pageSize, ...filter } = parse(adminDocumentsQuery, req.query);
    res.json(await this.d.documents.list(userPrincipal(req), filter, { page, pageSize }));
  };

  getDocument = async (req: Request, res: Response) => {
    res.json({ data: await this.d.documents.getForAdmin(userPrincipal(req), id(req)) });
  };

  downloadDocument = async (req: Request, res: Response) => {
    res.json({ data: await this.d.documents.download(userPrincipal(req), id(req), requestContext(req)) });
  };

  regenerateDocument = async (req: Request, res: Response) => {
    res.status(202).json({ data: await this.d.ops.regenerateDocument(userPrincipal(req), id(req), requestContext(req)) });
  };

  listPayments = async (req: Request, res: Response) => {
    const { page, pageSize, ...filter } = parse(adminListPaymentsQuery, req.query);
    res.json(await this.d.payments.list(userPrincipal(req), filter, { page, pageSize }));
  };

  getPayment = async (req: Request, res: Response) => {
    res.json({ data: await this.d.payments.get(userPrincipal(req), id(req)) });
  };

  listSubscriptions = async (req: Request, res: Response) => {
    const { page, pageSize, ...filter } = parse(listSubscriptionsQuery, req.query);
    res.json(await this.d.subscriptions.list(filter, { page, pageSize }));
  };

  getSubscription = async (req: Request, res: Response) => {
    res.json({ data: await this.d.subscriptions.get(id(req)) });
  };

  cancelSubscription = async (req: Request, res: Response) => {
    const { atPeriodEnd } = parse(cancelSubscriptionBody, req.body);
    res.json({ data: await this.d.subscriptions.cancel(userPrincipal(req), id(req), atPeriodEnd, requestContext(req)) });
  };

  listProducts = async (req: Request, res: Response) => {
    const { page, pageSize, status, ...filter } = parse(adminProductsQuery, req.query);
    res.json(await this.d.ops.listProducts({ ...filter, isActive: status }, { page, pageSize }));
  };

  getProduct = async (req: Request, res: Response) => {
    const { code } = parse(productParams, req.params);
    res.json({ data: await this.d.ops.getProduct(code) });
  };

  createProduct = async (req: Request, res: Response) => {
    const body = parse(createProductBody, req.body);
    res.status(201).json({ data: await this.d.ops.createProduct(userPrincipal(req), body, requestContext(req)) });
  };

  updateProduct = async (req: Request, res: Response) => {
    const { code } = parse(productParams, req.params);
    const body = parse(updateProductBody, req.body);
    res.json({ data: await this.d.ops.updateProduct(userPrincipal(req), code, body, requestContext(req)) });
  };

  deleteProduct = async (req: Request, res: Response) => {
    const { code } = parse(productParams, req.params);
    await this.d.ops.deleteProduct(userPrincipal(req), code, requestContext(req));
    res.status(204).end();
  };

  listTemplates = async (req: Request, res: Response) => {
    const { page, pageSize, status, ...filter } = parse(adminTemplatesQuery, req.query);
    res.json(await this.d.ops.listTemplates({ ...filter, isActive: status }, { page, pageSize }));
  };

  getTemplate = async (req: Request, res: Response) => {
    res.json({ data: await this.d.ops.getTemplate(id(req)) });
  };

  createTemplate = async (req: Request, res: Response) => {
    const body = parse(createTemplateBody, req.body);
    res.status(201).json({ data: await this.d.ops.createTemplate(userPrincipal(req), body, requestContext(req)) });
  };

  updateTemplate = async (req: Request, res: Response) => {
    const templateId = id(req);
    const body = parse(updateTemplateBody, req.body);
    res.json({ data: await this.d.ops.updateTemplate(userPrincipal(req), templateId, body, requestContext(req)) });
  };

  setDefaultTemplate = async (req: Request, res: Response) => {
    res.json({ data: await this.d.ops.setDefaultTemplate(userPrincipal(req), id(req), requestContext(req)) });
  };

  deleteTemplate = async (req: Request, res: Response) => {
    await this.d.ops.deleteTemplate(userPrincipal(req), id(req), requestContext(req));
    res.status(204).end();
  };

  uploadTemplatePreview = async (req: Request, res: Response) => {
    const templateId = id(req);
    if (!req.file) throw invalidPreview("Choose an image to upload");
    res.json({ data: await this.d.ops.setTemplatePreview(userPrincipal(req), templateId, req.file.buffer, requestContext(req)) });
  };

  removeTemplatePreview = async (req: Request, res: Response) => {
    res.json({ data: await this.d.ops.removeTemplatePreview(userPrincipal(req), id(req), requestContext(req)) });
  };

  listContactMessages = async (req: Request, res: Response) => {
    const { page, pageSize, status, q } = parse(listContactMessagesQuery, req.query);
    res.json(await this.d.support.list({ status, q: q || undefined }, { page, pageSize }));
  };

  createContactMessage = async (req: Request, res: Response) => {
    const input = parse(createContactMessageBody, req.body);
    res.status(201).json({ data: await this.d.support.create(userPrincipal(req), input, requestContext(req)) });
  };

  updateContactMessage = async (req: Request, res: Response) => {
    const changes = parse(updateContactMessageBody, req.body);
    res.json({ data: await this.d.support.update(userPrincipal(req), id(req), changes, requestContext(req)) });
  };

  replyContactMessage = async (req: Request, res: Response) => {
    const { message } = parse(replyContactMessageBody, req.body);
    res.json({ data: await this.d.support.reply(userPrincipal(req), id(req), message, requestContext(req)) });
  };

  deleteContactMessage = async (req: Request, res: Response) => {
    await this.d.support.remove(userPrincipal(req), id(req), requestContext(req));
    res.status(204).end();
  };

  listAuditLogs = async (req: Request, res: Response) => {
    const { page, pageSize, ...filter } = parse(auditLogsQuery, req.query);
    res.json(await this.d.audit.list(filter, { page, pageSize }));
  };
}
