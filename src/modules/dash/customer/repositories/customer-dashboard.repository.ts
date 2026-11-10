export interface CustomerDashboardStats {
  totalDocuments: number;
  paystubDocuments: number;
  successfulPayments: number;
}

export interface CustomerDashboardRepository {
  /** Only documents of paid orders count, matching what GET /documents shows. */
  stats(userId: string): Promise<CustomerDashboardStats>;
}
