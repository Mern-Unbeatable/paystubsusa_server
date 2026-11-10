import type { ChallengePurpose } from "../../../generated/prisma/enums.ts";
import { dbOf, prisma } from "../../../shared/db/prisma.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import type { ChallengeRow, VerificationChallengeRepository } from "./verification-challenge.repository.ts";

export class PrismaVerificationChallengeRepository implements VerificationChallengeRepository {
  async create(
    input: { id: string; email: string; userId: string | null; purpose: ChallengePurpose; secretHash: string; expiresAt: Date; ip: string | null },
    tx?: Tx,
  ) {
    await dbOf(tx).verificationChallenge.create({ data: input });
  }

  async invalidateOpen(email: string, purpose: ChallengePurpose, tx?: Tx) {
    await dbOf(tx).verificationChallenge.updateMany({
      where: { email, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  async lockById(id: string, tx: Tx) {
    const rows = await dbOf(tx).$queryRaw<ChallengeRow[]>`
      SELECT id, email, user_id AS "userId", purpose, secret_hash AS "secretHash", attempts,
             max_attempts AS "maxAttempts", expires_at AS "expiresAt", consumed_at AS "consumedAt"
      FROM verification_challenges WHERE id = ${id}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  async latestOpenIdForUser(userId: string, purpose: ChallengePurpose) {
    const row = await prisma.verificationChallenge.findFirst({
      where: { userId, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async incrementAttempts(id: string, tx: Tx) {
    const row = await dbOf(tx).verificationChallenge.update({
      where: { id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    return row.attempts;
  }

  async consume(id: string, tx: Tx) {
    await dbOf(tx).verificationChallenge.update({ where: { id }, data: { consumedAt: new Date() } });
  }

  async deleteCreatedBefore(before: Date) {
    return (await prisma.verificationChallenge.deleteMany({ where: { createdAt: { lt: before } } })).count;
  }
}
