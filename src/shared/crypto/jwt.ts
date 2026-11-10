import { SignJWT, importPKCS8, importSPKI, jwtVerify, type CryptoKey } from "jose";
import { env } from "../../config/env.ts";
import { sha256 } from "./tokens.ts";
import type { Role } from "../../generated/prisma/enums.ts";

const ALG = "EdDSA";
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const GUEST_TOKEN_TTL_SECONDS = 30 * 60;

let keys: Promise<{ priv: CryptoKey; pub: CryptoKey }> | undefined;
const getKeys = () =>
  (keys ??= Promise.all([importPKCS8(env.JWT_PRIVATE_KEY, ALG), importSPKI(env.JWT_PUBLIC_KEY, ALG)]).then(
    ([priv, pub]) => ({ priv, pub }),
  ));

export async function signAccessToken(userId: string, role: Role, sessionId: string): Promise<string> {
  return new SignJWT({ role, sid: sessionId })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(env.JWT_ISSUER)
    .setAudience("api")
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign((await getKeys()).priv);
}

export const GUEST_SCOPES = ["order:create", "order:read", "document:read"] as const;

export async function signGuestToken(email: string): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + GUEST_TOKEN_TTL_SECONDS * 1000);
  const token = await new SignJWT({ email, scope: GUEST_SCOPES })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(env.JWT_ISSUER)
    .setAudience("guest")
    .setSubject(sha256(email))
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign((await getKeys()).priv);
  return { token, expiresAt };
}

/** Returns null for any invalid, expired or wrong-audience token. */
export async function verifyAccessToken(token: string): Promise<{ userId: string; role: Role; sessionId: string | null } | null> {
  try {
    const { payload } = await jwtVerify(token, (await getKeys()).pub, {
      issuer: env.JWT_ISSUER,
      audience: "api",
      algorithms: [ALG],
    });
    if (typeof payload.sub !== "string" || (payload["role"] !== "customer" && payload["role"] !== "admin")) return null;
    const sid = payload["sid"];
    return { userId: payload.sub, role: payload["role"], sessionId: typeof sid === "string" ? sid : null };
  } catch {
    return null;
  }
}

export async function verifyGuestToken(token: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, (await getKeys()).pub, {
      issuer: env.JWT_ISSUER,
      audience: "guest",
      algorithms: [ALG],
    });
    const email = payload["email"];
    if (typeof email !== "string" || payload.sub !== sha256(email)) return null;
    return { email };
  } catch {
    return null;
  }
}
