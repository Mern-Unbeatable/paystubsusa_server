import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../../generated/prisma/client.ts";
import { env } from "../../config/env.ts";
import type { Tx } from "./transaction.ts";

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

export type Db = PrismaClient | Prisma.TransactionClient;

/** Repository implementations resolve the opaque `Tx` handle back to a Prisma client here. */
export const dbOf = (tx?: Tx): Db => (tx as unknown as Prisma.TransactionClient | undefined) ?? prisma;

export const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
