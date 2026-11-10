import { describe, expect, it } from "vitest";
import { canAccessOrder, scopeOf } from "../../src/shared/policies/access.ts";
import { decryptJson, encryptJson } from "../../src/shared/crypto/encryption.ts";
import { signAccessToken, signGuestToken, verifyAccessToken, verifyGuestToken } from "../../src/shared/crypto/jwt.ts";
import { backoffDelayMs } from "../../src/shared/jobs/job-runner.ts";

const order = { userId: "u1", email: "jane@example.com" };

describe("canAccessOrder", () => {
  it("allows the owner, a guest with the order email, and admins", () => {
    expect(canAccessOrder({ type: "user", userId: "u1", role: "customer", sessionId: "s" }, order)).toBe(true);
    expect(canAccessOrder({ type: "guest", email: "jane@example.com" }, order)).toBe(true);
    expect(canAccessOrder({ type: "user", userId: "x", role: "admin", sessionId: "s" }, order)).toBe(true);
  });

  it("denies other customers, other guests and anonymous callers", () => {
    expect(canAccessOrder({ type: "user", userId: "u2", role: "customer", sessionId: "s" }, order)).toBe(false);
    expect(canAccessOrder({ type: "guest", email: "eve@example.com" }, order)).toBe(false);
    expect(canAccessOrder({ type: "anonymous" }, order)).toBe(false);
  });

  it("scopes list queries by principal and rejects anonymous", () => {
    expect(scopeOf({ type: "user", userId: "u1", role: "customer", sessionId: "s" })).toEqual({ kind: "user", userId: "u1" });
    expect(scopeOf({ type: "guest", email: "a@b.co" })).toEqual({ kind: "email", email: "a@b.co" });
    expect(() => scopeOf({ type: "anonymous" })).toThrow();
  });
});

describe("encryption", () => {
  it("round-trips and detects tampering", () => {
    const { blob, keyId } = encryptJson({ ssn: "123-45-6789" });
    expect(Buffer.from(blob).includes(Buffer.from("123-45-6789"))).toBe(false);
    expect(decryptJson(blob, keyId)).toEqual({ ssn: "123-45-6789" });
    const tampered = new Uint8Array(blob);
    tampered[tampered.length - 1]! ^= 1;
    expect(() => decryptJson(tampered, keyId)).toThrow();
  });
});

describe("tokens", () => {
  it("keeps access and guest tokens apart (audience)", async () => {
    const access = await signAccessToken("u1", "customer", "s1");
    const guest = (await signGuestToken("jane@example.com")).token;
    expect(await verifyAccessToken(access)).toEqual({ userId: "u1", role: "customer", sessionId: "s1" });
    expect(await verifyGuestToken(guest)).toMatchObject({ email: "jane@example.com" });
    expect(await verifyAccessToken(guest)).toBeNull();
    expect(await verifyGuestToken(access)).toBeNull();
    expect(await verifyAccessToken(`${access.slice(0, -2)}xx`)).toBeNull();
  });
});

describe("job backoff", () => {
  it("doubles from 5 s", () => {
    expect([1, 2, 3, 4].map(backoffDelayMs)).toEqual([5000, 10000, 20000, 40000]);
  });
});
