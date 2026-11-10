import type { UserPrincipal } from "../../../shared/types.ts";
import type { DocumentsService } from "../../documents/index.ts";
import type { PaymentsService } from "../../payments/index.ts";
import type { SubscriptionsService } from "../../subscriptions/index.ts";
import type { CustomerDashboardRepository } from "./repositories/customer-dashboard.repository.ts";

export class CustomerDashboardService {
  private readonly repo: CustomerDashboardRepository;
  private readonly documents: DocumentsService;
  private readonly payments: PaymentsService;
  private readonly subscriptions: SubscriptionsService;

  constructor(repo: CustomerDashboardRepository, documents: DocumentsService, payments: PaymentsService, subscriptions: SubscriptionsService) {
    this.repo = repo;
    this.documents = documents;
    this.payments = payments;
    this.subscriptions = subscriptions;
  }

  async get(principal: UserPrincipal) {
    const recent = { page: 1, pageSize: 3 };
    const [stats, docs, payments, sub] = await Promise.all([
      this.repo.stats(principal.userId),
      this.documents.list(principal, { sort: { field: "createdAt", direction: "desc" } }, recent),
      this.payments.list(principal, {}, recent),
      this.subscriptions.getMine(principal.userId),
    ]);
    return {
      stats: { ...stats, subscription: sub ? { status: sub.status, planName: sub.planName } : null },
      recentDocuments: docs.data,
      recentPayments: payments.data,
    };
  }
}
