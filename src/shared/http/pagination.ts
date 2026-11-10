import { z } from "zod";

export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export const skipTake = ({ page, pageSize }: PageRequest) => ({ skip: (page - 1) * pageSize, take: pageSize });

export function toPage<T>(items: T[], totalItems: number, { page, pageSize }: PageRequest): Page<T> {
  return { data: items, meta: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) } };
}

/** `-createdAt` → { field: "createdAt", direction: "desc" }; restricted to an allow-list. */
export function sortQuery<const T extends string>(allowed: readonly T[], fallback: `${"" | "-"}${NoInfer<T>}`) {
  const values = allowed.flatMap((f) => [f, `-${f}`]) as [string, ...string[]];
  return z
    .enum(values)
    .default(fallback)
    .transform((s) => ({
      field: (s.startsWith("-") ? s.slice(1) : s) as T,
      direction: (s.startsWith("-") ? "desc" : "asc") as "asc" | "desc",
    }));
}

export type Sort<T extends string> = { field: T; direction: "asc" | "desc" };
