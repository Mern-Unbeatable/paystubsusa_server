import { describe, expect, it } from "vitest";
import { CatalogService, type ProductRepository, type ProductRow, type TemplateRepository } from "../../src/modules/catalog/index.ts";
import type { ObjectStorage } from "../../src/integrations/storage.ts";

const product = (p: Partial<ProductRow> & Pick<ProductRow, "code" | "amountCents">): ProductRow => ({
  id: p.code,
  documentType: "paystub",
  kind: "one_time",
  name: p.code,
  currency: "usd",
  interval: null,
  creditQuantity: 1,
  isAddon: false,
  isActive: true,
  stripePriceId: null,
  badge: null,
  sortOrder: 0,
  updatedAt: new Date(),
  ...p,
});

const catalog = [
  product({ code: "paystub_single", amountCents: 1299 }),
  product({ code: "paystub_pack_3", amountCents: 2499, creditQuantity: 3 }),
  product({ code: "paystub_additional", amountCents: 799, isAddon: true }),
  product({ code: "paystub_dd_slip", amountCents: 199, isAddon: true, creditQuantity: 0 }),
  product({ code: "w2_single", amountCents: 1499, documentType: "w2" }),
  product({ code: "unlimited_monthly", amountCents: 19900, kind: "subscription", documentType: null, interval: "month" }),
  product({ code: "retired", amountCents: 1, isActive: false }),
];

const products = { findByCodes: async (codes: string[]) => catalog.filter((p) => codes.includes(p.code)) } as unknown as ProductRepository;
const service = new CatalogService(products, {} as TemplateRepository, {} as ObjectStorage);

describe("CatalogService.quote", () => {
  it("prices a 3-pack plus 2 additional from the database ($24.99 + 2 × $7.99)", async () => {
    const q = await service.quote([{ productCode: "paystub_pack_3", quantity: 1 }, { productCode: "paystub_additional", quantity: 2 }]);
    expect(q.totalCents).toBe(4097);
    expect(q.credits).toBe(5);
    expect(q.documentType).toBe("paystub");
  });

  it("prices a single paystub plus Direct Deposit Slip ($12.99 + $1.99)", async () => {
    const q = await service.quote([
      { productCode: "paystub_single", quantity: 1 },
      { productCode: "paystub_dd_slip", quantity: 1 },
    ]);
    expect(q.totalCents).toBe(1498);
    expect(q.credits).toBe(1);
    expect(q.lines.map((l) => l.productCode)).toEqual(["paystub_single", "paystub_dd_slip"]);
  });

  it("allows additional paystubs together with the Direct Deposit Slip", async () => {
    const q = await service.quote([
      { productCode: "paystub_pack_3", quantity: 1 },
      { productCode: "paystub_additional", quantity: 1 },
      { productCode: "paystub_dd_slip", quantity: 1 },
    ]);
    expect(q.totalCents).toBe(2499 + 799 + 199);
    expect(q.credits).toBe(4);
  });

  it.each([
    [[{ productCode: "paystub_single", quantity: 2 }], "quantity"],
    [[{ productCode: "paystub_single", quantity: 1 }, { productCode: "paystub_pack_3", quantity: 1 }], "exactly one"],
    [[{ productCode: "w2_single", quantity: 1 }, { productCode: "paystub_additional", quantity: 1 }], "can't be added"],
    [[{ productCode: "paystub_single", quantity: 1 }, { productCode: "paystub_additional", quantity: 51 }], "between 1 and 50"],
    [[{ productCode: "paystub_single", quantity: 1 }, { productCode: "paystub_dd_slip", quantity: 2 }], "quantity must be 1"],
    [[{ productCode: "unlimited_monthly", quantity: 1 }, { productCode: "paystub_dd_slip", quantity: 1 }], "on its own"],
    [[{ productCode: "unlimited_monthly", quantity: 1 }, { productCode: "paystub_single", quantity: 1 }], "on its own"],
    [[{ productCode: "retired", quantity: 1 }], "Unknown"],
    [[{ productCode: "nope", quantity: 1 }], "Unknown"],
  ])("rejects invalid combinations (%#)", async (items, message) => {
    await expect(service.quote(items)).rejects.toMatchObject({ status: 422, errors: { items: [expect.stringContaining(message)] } });
  });

  it("rejects Unlimited when the global subscription product is Inactive", async () => {
    const inactiveCatalog = catalog.map((p) => (p.code === "unlimited_monthly" ? { ...p, isActive: false } : p));
    const inactiveProducts = {
      findByCodes: async (codes: string[]) => inactiveCatalog.filter((p) => codes.includes(p.code)),
    } as unknown as ProductRepository;
    const inactiveService = new CatalogService(inactiveProducts, {} as TemplateRepository, {} as ObjectStorage);
    await expect(inactiveService.quote([{ productCode: "unlimited_monthly", quantity: 1 }])).rejects.toMatchObject({
      status: 422,
      errors: { items: [expect.stringContaining("Unknown")] },
    });
  });
});
