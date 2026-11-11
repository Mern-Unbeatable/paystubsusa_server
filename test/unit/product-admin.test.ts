import { describe, expect, it, vi } from "vitest";
import {
  CatalogService,
  type NewProduct,
  type ProductRepository,
  type ProductWithUsage,
  type TemplateRepository,
} from "../../src/modules/catalog/index.ts";
import type { ObjectStorage } from "../../src/integrations/storage.ts";

const row = (code: string, usage = { orderItems: 0, subscriptions: 0 }): ProductWithUsage => ({
  id: `id-${code}`,
  code,
  documentType: "w2",
  kind: "one_time",
  name: code,
  amountCents: 1000,
  currency: "usd",
  interval: null,
  creditQuantity: 1,
  isAddon: false,
  isActive: true,
  stripePriceId: null,
  badge: null,
  sortOrder: 0,
  updatedAt: new Date(),
  usage,
});

const input = (p: Partial<NewProduct> = {}): NewProduct => ({
  code: "w2_rush",
  documentType: "w2",
  name: "W-2 Rush",
  amountCents: 1999,
  creditQuantity: 1,
  badge: null,
  sortOrder: 0,
  isActive: true,
  ...p,
});

function setup(rows: ProductWithUsage[], { deleteResult = true, createResult = true } = {}) {
  const repo = {
    findWithUsage: vi.fn(async (code: string) => rows.find((r) => r.code === code) ?? null),
    create: vi.fn(async (p: NewProduct) => (createResult ? { ...row(p.code), ...p } : null)),
    delete: vi.fn(async () => deleteResult),
  };
  return { repo, service: new CatalogService(repo as unknown as ProductRepository, {} as TemplateRepository, {} as ObjectStorage) };
}

describe("CatalogService admin product rules", () => {
  it("creates a one-time product", async () => {
    const { service, repo } = setup([]);
    await expect(service.createProduct(input())).resolves.toMatchObject({ code: "w2_rush", kind: "one_time" });
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it("rejects multi-document packs for non-paystub types (paid orders grant paystub credits)", async () => {
    const { service, repo } = setup([]);
    await expect(service.createProduct(input({ creditQuantity: 3 }))).rejects.toMatchObject({
      status: 422,
      errors: { creditQuantity: [expect.any(String)] },
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("returns 409 for a duplicate code", async () => {
    const { service } = setup([], { createResult: false });
    await expect(service.createProduct(input())).rejects.toMatchObject({ status: 409, code: "PRODUCT_CODE_TAKEN" });
  });

  it("deletes an unused custom product", async () => {
    const { service, repo } = setup([row("w2_rush")]);
    await expect(service.deleteProduct("w2_rush")).resolves.toMatchObject({ code: "w2_rush" });
    expect(repo.delete).toHaveBeenCalledWith("id-w2_rush");
  });

  it("never deletes system products", async () => {
    const { service, repo } = setup([row("unlimited_monthly")]);
    await expect(service.deleteProduct("unlimited_monthly")).rejects.toMatchObject({ status: 409, code: "PRODUCT_PROTECTED" });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it.each([
    [{ orderItems: 1, subscriptions: 0 }],
    [{ orderItems: 0, subscriptions: 2 }],
  ])("keeps products referenced by history (%o)", async (usage) => {
    const { service, repo } = setup([row("w2_rush", usage)]);
    await expect(service.deleteProduct("w2_rush")).rejects.toMatchObject({ status: 409, code: "PRODUCT_IN_USE" });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("maps a foreign-key race on delete to 409", async () => {
    const { service } = setup([row("w2_rush")], { deleteResult: false });
    await expect(service.deleteProduct("w2_rush")).rejects.toMatchObject({ status: 409, code: "PRODUCT_IN_USE" });
  });

  it("returns 404 for an unknown product", async () => {
    const { service } = setup([]);
    await expect(service.deleteProduct("nope")).rejects.toMatchObject({ status: 404 });
  });
});
