export { VerificationService, RESEND_COOLDOWN_SECONDS } from "./verification.service.ts";
export { VerificationController } from "./verification.controller.ts";
export { verificationRoutes } from "./verification.routes.ts";
export { emailField } from "./verification.schemas.ts";
export type { VerificationChallengeRepository } from "./repositories/verification-challenge.repository.ts";
export { PrismaVerificationChallengeRepository } from "./repositories/prisma-verification-challenge.repository.ts";
