import type { ChallengePurpose } from "../../../generated/prisma/enums.ts";
import type { Tx } from "../../../shared/db/transaction.ts";

export interface ChallengeRow {
  id: string;
  email: string;
  userId: string | null;
  purpose: ChallengePurpose;
  secretHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface VerificationChallengeRepository {
  create(
    input: { id: string; email: string; userId: string | null; purpose: ChallengePurpose; secretHash: string; expiresAt: Date; ip: string | null },
    tx?: Tx,
  ): Promise<void>;
  /** Marks older open challenges for the same email + purpose unusable (resend). */
  invalidateOpen(email: string, purpose: ChallengePurpose, tx?: Tx): Promise<void>;
  /** SELECT … FOR UPDATE; must run inside a transaction. */
  lockById(id: string, tx: Tx): Promise<ChallengeRow | null>;
  latestOpenIdForUser(userId: string, purpose: ChallengePurpose): Promise<string | null>;
  incrementAttempts(id: string, tx: Tx): Promise<number>;
  consume(id: string, tx: Tx): Promise<void>;
  deleteCreatedBefore(before: Date): Promise<number>;
}
