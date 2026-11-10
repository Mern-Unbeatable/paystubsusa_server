import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.ts",
  },
  datasource: {
    // Not env(): that throws when unset, and `prisma generate` runs at build time without a database.
    url: process.env.DATABASE_URL,
  },
});
