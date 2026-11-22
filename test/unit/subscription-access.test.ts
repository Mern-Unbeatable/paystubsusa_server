import { describe, expect, it, vi } from "vitest";
import { SubscriptionsService } from "../../src/modules/subscriptions/index.ts";
import type { CatalogService } from "../../src/modules/catalog/index.ts";
import type { SubscriptionRepository } from "../../src/modules/subscriptions/repositories/subscription.repository.ts";

const product = (isActive: boolean) => ({
  id: "prod-unlimited",
  code: "unlimited_monthly",
  name: "Unlimited Access",
  amountCents: 19900,
  currency: "usd",
  interval: "month" as const,
  isActive,
});

const subRow = (status: "active" | "past_due" | "canceled" | "unpaid") => ({
  id: "sub-1",
  userId: "user-1",
  productId: "prod-unlimited",
  stripeSubscriptionId: "sub_stripe",
  status,
  currentPeriodStart: new Date("2026-01-01"),
  currentPeriodEnd: new Date("2026-02-01"),
  cancelAtPeriodEnd: false,
  canceledAt: null,
  createdAt: new Date("2026-01-01"),
  product: {
    code: "unlimited_monthly",
    name: "Unlimited Access",
    amountCents: 19900,
    currency: "usd",
    interval: "month",
  },
  user: { id: "user-1", name: "Ada", email: "ada@example.com" },
});

function setup({ planActive, subStatus }: { planActive: boolean; subStatus: "active" | "past_due" | "canceled" | "unpaid" | null }) {
  const row = subStatus ? subRow(subStatus) : null;
  const subscriptions = {
    findActiveForUser: vi.fn(async () => (row && (row.status === "active" || row.status === "past_due") ? row : null)),
    latestForUser: vi.fn(async () => row),
  } as unknown as SubscriptionRepository;

  const catalog = {
    findProduct: vi.fn(async () => product(planActive)),
  } as unknown as CatalogService;

  const service = new SubscriptionsService({
    subscriptions,
    users: { findById: vi.fn(async () => null) } as never,
    catalog,
    gateway: {} as never,
    audit: {} as never,
    payments: {} as never,
    tx: {} as never,
  });

  // Skip Stripe reconcile for these unit tests.
  vi.spyOn(service, "reconcile").mockResolvedValue(undefined);

  return { service, subscriptions, catalog };
}

describe("SubscriptionsService global plan availability", () => {
  it("grants access when Stripe is active and the product is Active", async () => {
    const { service } = setup({ planActive: true, subStatus: "active" });
    await expect(service.activeFor("user-1")).resolves.toMatchObject({ status: "active" });
    const mine = await service.getMine("user-1");
    expect(mine).toMatchObject({ status: "active", planAvailable: true, accessActive: true });
  });

  it("grants access when Stripe is past_due and the product is Active", async () => {
    const { service } = setup({ planActive: true, subStatus: "past_due" });
    await expect(service.activeFor("user-1")).resolves.toMatchObject({ status: "past_due" });
    const mine = await service.getMine("user-1");
    expect(mine).toMatchObject({ status: "past_due", planAvailable: true, accessActive: true });
  });

  it("denies access when Stripe is active but the product is Inactive", async () => {
    const { service, subscriptions } = setup({ planActive: false, subStatus: "active" });
    await expect(service.activeFor("user-1")).resolves.toBeNull();
    expect(subscriptions.findActiveForUser).not.toHaveBeenCalled();
    const mine = await service.getMine("user-1");
    expect(mine).toMatchObject({
      status: "active",
      planAvailable: false,
      accessActive: false,
    });
  });

  it("denies access when Stripe is past_due but the product is Inactive", async () => {
    const { service } = setup({ planActive: false, subStatus: "past_due" });
    await expect(service.activeFor("user-1")).resolves.toBeNull();
    const mine = await service.getMine("user-1");
    expect(mine).toMatchObject({ status: "past_due", planAvailable: false, accessActive: false });
  });

  it("denies access when Stripe is canceled even if the product is Active", async () => {
    const { service } = setup({ planActive: true, subStatus: "canceled" });
    await expect(service.activeFor("user-1")).resolves.toBeNull();
    const mine = await service.getMine("user-1");
    expect(mine).toMatchObject({ status: "canceled", planAvailable: true, accessActive: false });
  });

  it("denies access when Stripe is unpaid even if the product is Active", async () => {
    const { service } = setup({ planActive: true, subStatus: "unpaid" });
    await expect(service.activeFor("user-1")).resolves.toBeNull();
    const mine = await service.getMine("user-1");
    expect(mine).toMatchObject({ status: "unpaid", planAvailable: true, accessActive: false });
  });

  it("reports planAvailable without fabricating a subscription when the user never subscribed", async () => {
    const { service } = setup({ planActive: false, subStatus: null });
    await expect(service.activeFor("user-1")).resolves.toBeNull();
    await expect(service.getMine("user-1")).resolves.toBeNull();
    await expect(service.isPlanAvailable()).resolves.toBe(false);
  });
});
