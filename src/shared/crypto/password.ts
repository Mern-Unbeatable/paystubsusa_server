import argon2 from "argon2";

const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => argon2.hash(plain, OPTIONS);

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;
/** Burns the same time as a real check so login doesn't reveal which emails exist. */
export async function verifyAgainstDummy(plain: string): Promise<false> {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(await dummyHash, plain);
  return false;
}

// shortcut: a small embedded list of the most common passwords, upgrade to the HIBP range API if breach checks must be exhaustive.
const COMMON = new Set([
  "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "12341234", "87654321", "11111111", "00000000", "123123123",
  "qwertyui", "qwerty123", "qwertyuiop", "1q2w3e4r", "1qaz2wsx", "asdfghjk", "zxcvbnm1", "iloveyou",
  "sunshine", "princess", "football", "baseball", "superman", "trustno1", "welcome1", "welcome123",
  "letmein1", "admin123", "administrator", "abc12345", "abcd1234", "changeme", "monkey123", "dragon123",
  "master123", "shadow123", "michael1", "computer", "whatever", "starwars", "internet", "paystubs",
]);

export const isCommonPassword = (plain: string) => COMMON.has(plain.toLowerCase());
