import type { Role } from "../generated/prisma/enums.ts";

export type UserPrincipal = { type: "user"; userId: string; role: Role; sessionId: string | null };
export type GuestPrincipal = { type: "guest"; email: string };
export type AnonymousPrincipal = { type: "anonymous" };
export type Principal = UserPrincipal | GuestPrincipal | AnonymousPrincipal;

/** Request metadata services may record (audit, rate limits); never Express objects. */
export interface RequestContext {
  ip: string | undefined;
  userAgent: string | undefined;
}

declare global {
  namespace Express {
    interface Request {
      id: string;
      principal: Principal;
      /** Second guest token, for unverified customers at checkout (X-Guest-Token). */
      extraGuestEmail?: string;
    }
  }
}
