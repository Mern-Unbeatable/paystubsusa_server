/**
 * Migrate legacy PDF keys to:
 *   documents/{email-prefix}_{id6}/{YYYY}/{MM}/{type}_{NNN}.pdf
 *
 * Usage (from server/):
 *   node --env-file-if-exists=.env scripts/migrate-document-storage-keys.mjs
 *   node --env-file-if-exists=.env scripts/migrate-document-storage-keys.mjs --apply
 *   node --env-file-if-exists=.env scripts/migrate-document-storage-keys.mjs --apply --delete-old
 *
 * Default is dry-run (no DB or filesystem writes).
 */
import { createHash } from "node:crypto";
import { prisma } from "../src/shared/db/prisma.ts";
import { LocalStorage } from "../src/integrations/storage.ts";
import {
  buildDocumentStorageKey,
  isCurrentDocumentStorageKey,
} from "../src/modules/documents/storage-key.ts";
import { PrismaDocumentRepository } from "../src/modules/documents/repositories/prisma-document.repository.ts";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const deleteOld = args.has("--delete-old");

if (deleteOld && !apply) {
  console.error("--delete-old requires --apply");
  process.exit(1);
}

const storage = new LocalStorage();
const documents = new PrismaDocumentRepository();
const sha256hex = (buf) => createHash("sha256").update(buf).digest("hex");

const rows = await prisma.document.findMany({
  where: { pdfStorageKey: { not: null } },
  select: {
    id: true,
    type: true,
    createdAt: true,
    pdfStorageKey: true,
    pdfSha256: true,
    orderId: true,
    order: {
      select: {
        email: true,
        userId: true,
      },
    },
  },
  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
});

async function loadPdfBody(doc, oldKey) {
  const primary = await storage.get(oldKey);
  if (primary) return { body: primary, source: oldKey };
  // Recover from the original UUID layout if the DB key was remapped earlier but the file wasn't.
  const yyyy = doc.createdAt.getUTCFullYear();
  const mm = String(doc.createdAt.getUTCMonth() + 1).padStart(2, "0");
  const uuidKey = `documents/${yyyy}/${mm}/${doc.orderId}/${doc.id}.pdf`;
  if (uuidKey !== oldKey) {
    const legacy = await storage.get(uuidKey);
    if (legacy) return { body: legacy, source: uuidKey };
  }
  return null;
}

let planned = 0;
let skipped = 0;
let migrated = 0;
let failed = 0;

console.log(
  `Mode: ${apply ? (deleteOld ? "apply + delete-old" : "apply") : "dry-run"} · ${rows.length} document(s) with pdfStorageKey`,
);

for (const doc of rows) {
  const oldKey = doc.pdfStorageKey;
  if (!oldKey) {
    skipped++;
    continue;
  }
  if (isCurrentDocumentStorageKey(oldKey)) {
    skipped++;
    continue;
  }

  const sequence = await documents.ownerMonthSequence({
    documentId: doc.id,
    createdAt: doc.createdAt,
    email: doc.order.email,
    userId: doc.order.userId,
  });

  const newKey = buildDocumentStorageKey({
    createdAt: doc.createdAt,
    email: doc.order.email,
    userId: doc.order.userId,
    type: doc.type,
    sequence,
  });

  if (newKey === oldKey) {
    skipped++;
    continue;
  }

  planned++;
  console.log(`${apply ? "MIGRATE" : "PLAN"} ${doc.id}`);
  console.log(`  from ${oldKey}`);
  console.log(`  to   ${newKey}`);

  if (!apply) continue;

  try {
    const loaded = await loadPdfBody(doc, oldKey);
    if (!loaded) throw new Error("old object missing on disk");
    const { body, source } = loaded;
    if (source !== oldKey) console.log(`  recovered from ${source}`);
    if (doc.pdfSha256 && sha256hex(body) !== doc.pdfSha256) {
      throw new Error("sha256 mismatch vs pdfSha256");
    }

    await storage.put(newKey, body, "application/pdf");
    const copied = await storage.get(newKey);
    if (!copied || copied.length !== body.length) {
      throw new Error("copy verification failed");
    }

    await prisma.document.update({
      where: { id: doc.id },
      data: { pdfStorageKey: newKey },
    });
    migrated++;

    if (deleteOld) {
      await storage.delete(oldKey);
      if (source !== oldKey) await storage.delete(source);
      console.log(`  deleted old object(s)`);
    }
  } catch (err) {
    failed++;
    console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(
  JSON.stringify({ planned, skipped, migrated, failed, apply, deleteOld }, null, 2),
);

await prisma.$disconnect();
process.exit(failed > 0 ? 1 : 0);
