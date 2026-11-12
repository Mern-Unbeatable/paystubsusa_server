import type { UserStatus } from "../../../generated/prisma/enums.ts";
import { env } from "../../../config/env.ts";
import type { TransactionManager } from "../../../shared/db/transaction.ts";
import { forbidden, notFound } from "../../../shared/http/app-error.ts";
import { toPage, type PageRequest } from "../../../shared/http/pagination.ts";
import type { Principal, RequestContext } from "../../../shared/types.ts";
import { actorOf, type AuditService } from "../../audit/index.ts";
import type { SessionService, UserRepository } from "../../auth/index.ts";
import type { DocumentsService } from "../../documents/index.ts";
import type { NotificationsService } from "../../notifications/index.ts";
import type { OrdersService } from "../../orders/index.ts";
import type { SubscriptionsService } from "../../subscriptions/index.ts";
import type {
  AdminCustomerFilter,
  AdminCustomerRepository,
  GuestBuyerFilter,
} from "./repositories/admin-customer.repository.ts";

interface Deps {
  customers: AdminCustomerRepository;
  users: UserRepository;
  sessions: SessionService;
  orders: OrdersService;
  documents: DocumentsService;
  subscriptions: SubscriptionsService;
  audit: AuditService;
  notifications: NotificationsService;
  tx: TransactionManager;
}

export class AdminCustomersService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  async list(filter: AdminCustomerFilter, page: PageRequest) {
    const { items, total } = await this.d.customers.list(filter, page);
    return toPage(items, total, page);
  }

  async listGuests(filter: GuestBuyerFilter, page: PageRequest) {
    const { items, total } = await this.d.customers.listGuests(filter, page);
    return toPage(items, total, page);
  }

  async get(id: string) {
    const customer = await this.d.customers.find(id);
    if (!customer) throw notFound("CUSTOMER_NOT_FOUND", "Customer not found");
    const recent = { page: 1, pageSize: 10 };
    const [orders, documents, subscription] = await Promise.all([
      this.d.orders.listForUser(id, recent),
      this.d.documents.listForUser(id, recent),
      this.d.subscriptions.getMine(id),
    ]);
    return { ...customer, orders, documents, subscription };
  }

  /** Suspension revokes every session; admins can't be targeted. The user is emailed only when the status actually changes. */
  async setStatus(principal: Principal, id: string, input: { status: UserStatus; reason?: string }, ctx: RequestContext) {
    const user = await this.d.users.findById(id);
    if (!user) throw notFound("CUSTOMER_NOT_FOUND", "Customer not found");
    if (user.role === "admin") throw forbidden("ADMIN_NOT_MODIFIABLE", "Admin accounts can't be changed here");

    await this.d.tx.run(async (tx) => {
      await this.d.users.setStatus(id, input.status, tx);
      if (input.status === "suspended") await this.d.sessions.revokeAll(id, null, tx);
      if (user.status !== input.status) {
        await this.d.notifications.enqueue(
          "account_status",
          user.email,
          {
            name: user.name,
            status: input.status,
            message: input.reason,
            loginUrl: `${env.APP_URL}/auth/login`,
            supportEmail: env.SUPPORT_EMAIL,
          },
          { tx },
        );
      }
      await this.d.audit.record(
        {
          ...actorOf(principal),
          action: input.status === "suspended" ? "customer.suspend" : "customer.activate",
          targetType: "user",
          targetId: id,
          metadata: input.reason ? { reason: input.reason } : undefined,
          ip: ctx.ip,
        },
        tx,
      );
    });
    return this.get(id);
  }
}
