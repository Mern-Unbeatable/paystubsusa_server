/** Prints fresh secrets for .env. Nothing is written to disk. */
import { generateKeyPairSync, randomBytes } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const oneLine = (pem: string) => pem.trim().replace(/\n/g, "\\n");

console.log(`JWT_PRIVATE_KEY="${oneLine(privateKey.export({ type: "pkcs8", format: "pem" }).toString())}"`);
console.log(`JWT_PUBLIC_KEY="${oneLine(publicKey.export({ type: "spki", format: "pem" }).toString())}"`);
console.log(`CODE_PEPPER=${randomBytes(32).toString("base64url")}`);
console.log(`ENCRYPTION_MASTER_KEY=${randomBytes(32).toString("base64")}`);
