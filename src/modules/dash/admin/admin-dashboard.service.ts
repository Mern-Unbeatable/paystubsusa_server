import type { UserPrincipal } from "../../../shared/types.ts";
import type { AuditService } from "../../audit/index.ts";
import type { OrdersService } from "../../orders/index.ts";
import type { AdminDashboardRepository } from "./repositories/admin-dashboard.repository.ts";

const CACHE_TTL_MS = 60_000;

export class AdminDashboardService {
  private readonly repo: AdminDashboardRepository;
  private readonly orders: OrdersService;
  private readonly audit: AuditService;
  // shortcut: per-instance cache, so instances can disagree for up to 60 s; fine for KPIs.
  private readonly cache = new Map<number, { at: number; value: Promise<unknown> }>();

  constructor(repo: AdminDashboardRepository, orders: OrdersService, audit: AuditService) {
    this.repo = repo;
    this.orders = orders;
    this.audit = audit;
  }

  get(admin: UserPrincipal, months: 6 | 12) {
    const hit = this.cache.get(months);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
    const value = this.compute(admin, months);
    this.cache.set(months, { at: Date.now(), value });
    value.catch(() => this.cache.delete(months));
    return value;
  }

  private async compute(admin: UserPrincipal, months: number) {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [kpis, revenue, byType, recentOrders, activity] = await Promise.all([
      this.repo.kpis(startOfToday),
      this.repo.revenueByMonth(months),
      this.repo.documentsByType(),
      this.orders.list(admin, {}, { page: 1, pageSize: 5 }),
      this.audit.recent(5),
    ]);
    const totalDocs = byType.reduce((sum, r) => sum + r.count, 0);
    return {
      kpis,
      revenue,
      documentBreakdown: byType.map((r) => ({ ...r, percent: totalDocs ? Math.round((r.count / totalDocs) * 100) : 0 })),
      recentOrders: recentOrders.data,
      activity: activity.map(({ ip: _ip, ...a }) => a),
    };
  }
}
