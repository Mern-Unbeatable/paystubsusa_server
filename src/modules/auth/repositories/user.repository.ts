import type { Role, UserStatus } from "../../../generated/prisma/enums.ts";
import type { Tx } from "../../../shared/db/transaction.ts";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarKey: string | null;
  passwordHash: string;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  stripeCustomerId: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface UserRepository {
  findById(id: string, tx?: Tx): Promise<UserRow | null>;
  findByEmail(email: string): Promise<UserRow | null>;
  findByStripeCustomerId(customerId: string): Promise<UserRow | null>;
  /** Returns null when the email is already taken. */
  create(input: { email: string; name: string; passwordHash: string; role?: Role; emailVerifiedAt?: Date | null }, tx?: Tx): Promise<UserRow | null>;
  touchLastLogin(id: string): Promise<void>;
  markEmailVerified(id: string, tx?: Tx): Promise<UserRow>;
  updatePassword(id: string, passwordHash: string, tx?: Tx): Promise<void>;
  updateProfile(id: string, input: { name?: string; phone?: string | null }): Promise<UserRow>;
  setAvatarKey(id: string, avatarKey: string | null): Promise<UserRow>;
  /** Sets the Stripe customer id only if none is set; returns the stored id. */
  setStripeCustomerId(id: string, customerId: string): Promise<string>;
  setStatus(id: string, status: UserStatus, tx?: Tx): Promise<void>;
}
