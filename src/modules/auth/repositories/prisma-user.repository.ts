import type { Role, UserStatus } from "../../../generated/prisma/enums.ts";
import { dbOf, isUniqueViolation, prisma } from "../../../shared/db/prisma.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import type { UserRepository } from "./user.repository.ts";

export class PrismaUserRepository implements UserRepository {
  findById(id: string, tx?: Tx) {
    return dbOf(tx).user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  findByStripeCustomerId(customerId: string) {
    return prisma.user.findUnique({ where: { stripeCustomerId: customerId } });
  }

  async create(
    input: { email: string; name: string; passwordHash: string; role?: Role; emailVerifiedAt?: Date | null },
    tx?: Tx,
  ) {
    try {
      return await dbOf(tx).user.create({ data: input });
    } catch (err) {
      if (isUniqueViolation(err)) return null;
      throw err;
    }
  }

  async touchLastLogin(id: string) {
    await prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  markEmailVerified(id: string, tx?: Tx) {
    return dbOf(tx).user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
  }

  async updatePassword(id: string, passwordHash: string, tx?: Tx) {
    await dbOf(tx).user.update({ where: { id }, data: { passwordHash } });
  }

  updateProfile(id: string, input: { name?: string; phone?: string | null }) {
    return prisma.user.update({ where: { id }, data: input });
  }

  setAvatarKey(id: string, avatarKey: string | null) {
    return prisma.user.update({ where: { id }, data: { avatarKey } });
  }

  async setStripeCustomerId(id: string, customerId: string) {
    await prisma.user.updateMany({ where: { id, stripeCustomerId: null }, data: { stripeCustomerId: customerId } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { stripeCustomerId: true } });
    return user.stripeCustomerId ?? customerId;
  }

  async setStatus(id: string, status: UserStatus, tx?: Tx) {
    await dbOf(tx).user.update({ where: { id }, data: { status } });
  }
}
