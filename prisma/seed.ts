/**
 * Idempotent seed: catalog ([DECISION] 4 checkout prices), templates and an optional first admin.
 * Existing rows are left untouched so re-running never overwrites admin edits.
 */
import type { DocumentType, ProductKind } from "../src/generated/prisma/enums.ts";
import { prisma } from "../src/shared/db/prisma.ts";
import { hashPassword } from "../src/shared/crypto/password.ts";

interface SeedProduct {
  code: string;
  documentType: DocumentType | null;
  kind: ProductKind;
  name: string;
  amountCents: number;
  creditQuantity?: number;
  isAddon?: boolean;
  interval?: "month";
  badge?: string;
  stripePriceId?: string;
  sortOrder: number;
}

const products: SeedProduct[] = [
  { code: "paystub_single", documentType: "paystub", kind: "one_time", name: "1 Paystub", amountCents: 1299, sortOrder: 10 },
  { code: "paystub_pack_3", documentType: "paystub", kind: "one_time", name: "3 Paystubs", amountCents: 2499, creditQuantity: 3, badge: "Save 35%", sortOrder: 20 },
  { code: "paystub_additional", documentType: "paystub", kind: "one_time", name: "Additional Paystub", amountCents: 799, isAddon: true, sortOrder: 30 },
  { code: "w2_single", documentType: "w2", kind: "one_time", name: "W-2 Form", amountCents: 1499, sortOrder: 40 },
  { code: "nec1099_single", documentType: "nec1099", kind: "one_time", name: "1099-NEC Form", amountCents: 1499, sortOrder: 50 },
  { code: "direct_deposit_single", documentType: "direct_deposit", kind: "one_time", name: "Direct Deposit Form", amountCents: 1499, sortOrder: 60 },
  {
    code: "unlimited_monthly",
    documentType: null,
    kind: "subscription",
    name: "Unlimited Access",
    amountCents: 19900,
    interval: "month",
    stripePriceId: process.env["STRIPE_UNLIMITED_PRICE_ID"] || undefined,
    sortOrder: 70,
  },
];

const paystubVariants = [
  ["01", "Classic layout", { headerVariant: "dark-full", netPayVariant: "dark", tableVariant: "light-blue" }],
  ["02", "Minimal layout", { headerVariant: "minimal-blue-line", netPayVariant: "blue", tableVariant: "solid-blue" }],
  ["03", "Boxed layout", { headerVariant: "boxed", netPayVariant: "blue", tableVariant: "light-blue" }],
  ["04", "Corporate layout", { headerVariant: "split-dark", netPayVariant: "dark", tableVariant: "solid-dark" }],
  ["05", "Modern layout", { headerVariant: "blue-full", netPayVariant: "blue", tableVariant: "solid-blue" }],
  ["06", "Executive layout", { headerVariant: "minimal-dark-line", netPayVariant: "dark", tableVariant: "minimal-gray" }],
  ["07", "Detailed layout", { headerVariant: "boxed", netPayVariant: "dark", tableVariant: "solid-dark" }],
  ["08", "Compact layout", { headerVariant: "split-blue", netPayVariant: "blue", tableVariant: "light-blue" }],
] as const;

const classic = { headerVariant: "dark-full", netPayVariant: "dark", tableVariant: "light-blue" };

const templates: { documentType: DocumentType; code: string; subtitle: string; renderer: string; variant: object | null; sortOrder: number }[] = [
  ...paystubVariants.map(([code, subtitle, variant], i) => ({ documentType: "paystub" as const, code, subtitle, renderer: "variant", variant, sortOrder: i + 1 })),
  { documentType: "paystub", code: "09", subtitle: "Statement layout", renderer: "earnings-statement", variant: null, sortOrder: 9 },
  { documentType: "paystub", code: "10", subtitle: "Check layout", renderer: "check-statement", variant: null, sortOrder: 10 },
  { documentType: "w2", code: "01", subtitle: "Classic layout", renderer: "w2", variant: classic, sortOrder: 1 },
  { documentType: "nec1099", code: "01", subtitle: "Classic layout", renderer: "nec1099", variant: classic, sortOrder: 1 },
  { documentType: "direct_deposit", code: "01", subtitle: "Classic layout", renderer: "direct-deposit", variant: classic, sortOrder: 1 },
];

async function main() {
  for (const p of products) {
    await prisma.product.upsert({ where: { code: p.code }, create: p, update: {} });
  }
  for (const t of templates) {
    await prisma.documentTemplate.upsert({
      where: { documentType_code: { documentType: t.documentType, code: t.code } },
      create: { ...t, title: `Template ${t.code}`, variant: t.variant ?? undefined, isDefault: t.code === "01" },
      update: {},
    });
  }

  await seedUser("admin", "ADMIN", "Administrator");
  // Demo customer for local testing only (email pre-verified so checkout works immediately).
  if (process.env["NODE_ENV"] !== "production") await seedUser("customer", "CUSTOMER", "Demo Customer");
  console.log(`Seeded ${products.length} products and ${templates.length} templates`);
}

/** Creates the user from SEED_<prefix>_EMAIL / _PASSWORD / _NAME if set; never modifies an existing account. */
async function seedUser(role: "admin" | "customer", prefix: string, defaultName: string) {
  const email = process.env[`SEED_${prefix}_EMAIL`]?.trim().toLowerCase();
  const password = process.env[`SEED_${prefix}_PASSWORD`];
  if (!email || !password) return;
  if (password.length < 12) throw new Error(`SEED_${prefix}_PASSWORD must be at least 12 characters`);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: { email, name: process.env[`SEED_${prefix}_NAME`] || defaultName, passwordHash: await hashPassword(password), role, emailVerifiedAt: new Date() },
    });
    console.log(`Created ${role} ${email}`);
  } else if (existing.role !== role) {
    console.warn(`${email} exists as a ${existing.role}; not changing it`);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
