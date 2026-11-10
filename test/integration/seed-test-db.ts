/** Child process for global-setup: fills throwaway env, then runs the real seed. */
import "../setup-env.ts";
await import("../../prisma/seed.ts");
