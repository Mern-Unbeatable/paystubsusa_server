import { env } from "./config/env.ts";
import { prisma } from "./shared/db/prisma.ts";
import { PrismaTransactionManager } from "./shared/db/prisma-transaction-manager.ts";
import { PrismaIdempotencyRepository } from "./shared/db/prisma-idempotency.repository.ts";
import { PrismaJobRepository } from "./shared/jobs/prisma-job.repository.ts";
import { DbRateLimiter } from "./shared/rate-limit/db-rate-limiter.ts";
import { StripeGateway, type PaymentGateway } from "./integrations/stripe.ts";
import { FileMailer, SmtpMailer, type Mailer } from "./integrations/mailer.ts";
import { LocalStorage, type ObjectStorage } from "./integrations/storage.ts";
import {
  PlaywrightRenderer,
  type DocumentRenderer,
} from "./integrations/renderer.ts";
import {
  AuditService,
  PrismaAuditLogRepository,
} from "./modules/audit/index.ts";
import {
  NotificationsService,
  PrismaEmailDeliveryRepository,
} from "./modules/notifications/index.ts";
import {
  PrismaVerificationChallengeRepository,
  VerificationController,
  VerificationService,
} from "./modules/verification/index.ts";
import {
  AuthController,
  AuthService,
  PrismaRefreshSessionRepository,
  PrismaUserRepository,
  SessionService,
} from "./modules/auth/index.ts";
import {
  AccountsController,
  AccountsService,
} from "./modules/accounts/index.ts";
import {
  CatalogController,
  CatalogService,
  PrismaProductRepository,
  PrismaTemplateRepository,
} from "./modules/catalog/index.ts";
import {
  DocumentsController,
  DocumentsService,
  PrismaDocumentRepository,
} from "./modules/documents/index.ts";
import {
  PaymentsController,
  PaymentsService,
  PrismaPaymentRepository,
  PrismaWebhookEventRepository,
  WebhookService,
} from "./modules/payments/index.ts";
import {
  PrismaSubscriptionRepository,
  SubscriptionsController,
  SubscriptionsService,
} from "./modules/subscriptions/index.ts";
import {
  EntitlementsService,
  OrdersController,
  OrdersService,
  PrismaEntitlementRepository,
  PrismaOrderRepository,
} from "./modules/orders/index.ts";
import {
  PrismaContactMessageRepository,
  SupportController,
  SupportService,
} from "./modules/support/index.ts";
import {
  CustomerDashboardController,
  CustomerDashboardService,
  PrismaCustomerDashboardRepository,
} from "./modules/dash/customer/index.ts";
import {
  AdminController,
  AdminCustomersService,
  AdminDashboardService,
  AdminOperationsService,
  PrismaAdminCustomerRepository,
  PrismaAdminDashboardRepository,
} from "./modules/dash/admin/index.ts";

export interface Integrations {
  gateway: PaymentGateway;
  mailer: Mailer;
  storage: ObjectStorage;
  renderer: DocumentRenderer;
}

/** Composition root: the only place concrete repositories and integrations are chosen. */
export function createContainer(overrides: Partial<Integrations> = {}) {
  const integrations: Integrations = {
    gateway: overrides.gateway ?? new StripeGateway(),
    mailer:
      overrides.mailer ??
      (env.MAIL_DRIVER === "smtp" ? new SmtpMailer() : new FileMailer()),
    storage: overrides.storage ?? new LocalStorage(),
    renderer: overrides.renderer ?? new PlaywrightRenderer(),
  };
  const { gateway, mailer, storage, renderer } = integrations;

  const tx = new PrismaTransactionManager();
  const jobs = new PrismaJobRepository();
  const idempotency = new PrismaIdempotencyRepository();
  const limiter = new DbRateLimiter();
  const users = new PrismaUserRepository();
  const refreshSessions = new PrismaRefreshSessionRepository();
  const challenges = new PrismaVerificationChallengeRepository();
  const webhookEvents = new PrismaWebhookEventRepository();
  const paymentRepo = new PrismaPaymentRepository();

  const audit = new AuditService(new PrismaAuditLogRepository());
  const notifications = new NotificationsService({
    deliveries: new PrismaEmailDeliveryRepository(),
    jobs,
    mailer,
    storage,
  });
  const verification = new VerificationService({
    challenges,
    notifications,
    tx,
  });
  const catalog = new CatalogService(
    new PrismaProductRepository(),
    new PrismaTemplateRepository(),
    storage,
  );
  const documents = new DocumentsService({
    documents: new PrismaDocumentRepository(),
    jobs,
    storage,
    renderer,
    audit,
    notifications,
  });
  const payments = new PaymentsService(paymentRepo, gateway);
  const subscriptions = new SubscriptionsService({
    subscriptions: new PrismaSubscriptionRepository(),
    users,
    catalog,
    gateway,
    audit,
  });
  const entitlements = new EntitlementsService({
    entitlements: new PrismaEntitlementRepository(),
    catalog,
    documents,
    tx,
  });
  const orders = new OrdersService({
    orders: new PrismaOrderRepository(),
    users,
    catalog,
    documents,
    entitlements,
    payments,
    subscriptions,
    notifications,
    audit,
    tx,
  });
  const sessions = new SessionService({
    sessions: refreshSessions,
    users,
    audit,
    tx,
  });
  const auth = new AuthService({
    users,
    sessions,
    verification,
    audit,
    orders,
    tx,
  });
  const accounts = new AccountsService({ users, sessions, audit, tx, storage });
  const webhooks = new WebhookService({
    gateway,
    tx,
    events: webhookEvents,
    payments: paymentRepo,
    orders,
    subscriptions,
  });
  const support = new SupportService(
    new PrismaContactMessageRepository(),
    notifications,
    audit,
    tx,
  );
  const customerDashboard = new CustomerDashboardService(
    new PrismaCustomerDashboardRepository(),
    documents,
    payments,
    subscriptions,
  );
  const adminDashboard = new AdminDashboardService(
    new PrismaAdminDashboardRepository(),
    orders,
    audit,
  );
  const adminCustomers = new AdminCustomersService({
    customers: new PrismaAdminCustomerRepository(),
    users,
    sessions,
    orders,
    documents,
    subscriptions,
    audit,
    tx,
  });
  const adminOps = new AdminOperationsService({
    orders,
    payments,
    documents,
    catalog,
    users,
    gateway,
    audit,
    tx,
  });

  return {
    integrations,
    repositories: {
      users,
      jobs,
      idempotency,
      limiter,
      refreshSessions,
      challenges,
      webhookEvents,
    },
    services: {
      audit,
      notifications,
      verification,
      catalog,
      documents,
      payments,
      subscriptions,
      entitlements,
      orders,
      sessions,
      auth,
      accounts,
      webhooks,
      support,
    },
    controllers: {
      auth: new AuthController(auth),
      accounts: new AccountsController(accounts),
      verification: new VerificationController(verification),
      catalog: new CatalogController(catalog),
      documents: new DocumentsController(documents),
      orders: new OrdersController(orders, entitlements, webhooks),
      payments: new PaymentsController(payments, webhooks),
      subscriptions: new SubscriptionsController(subscriptions),
      support: new SupportController(support),
      customerDashboard: new CustomerDashboardController(customerDashboard),
      admin: new AdminController({
        dashboard: adminDashboard,
        customers: adminCustomers,
        ops: adminOps,
        orders,
        documents,
        payments,
        subscriptions,
        support,
        audit,
      }),
    },
    checkDatabase: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
