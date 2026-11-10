import type { DocumentType } from "../../../../generated/prisma/enums.ts";

export interface AdminKpis {
  totalCustomers: number;
  totalDocuments: number;
  totalOrders: number;
  totalRevenueCents: number;
  activeSubscriptions: number;
  generatedToday: number;
}

export interface AdminDashboardRepository {
  kpis(startOfToday: Date): Promise<AdminKpis>;
  /** Net captured revenue per UTC month, oldest first, months without revenue included as 0. */
  revenueByMonth(months: number): Promise<{ month: string; revenueCents: number }[]>;
  documentsByType(): Promise<{ type: DocumentType; count: number }[]>;
}
