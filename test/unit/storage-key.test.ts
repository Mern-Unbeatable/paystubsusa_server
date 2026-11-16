import { describe, expect, it } from "vitest";
import {
  buildDocumentStorageKey,
  emailLocalPart,
  filePrefixForType,
  isCurrentDocumentStorageKey,
  ownerDirectory,
  ownerId6,
  sanitizeSlug,
} from "../../src/modules/documents/storage-key.ts";

describe("sanitizeSlug", () => {
  it("normalizes email prefixes", () => {
    expect(sanitizeSlug("Nayem.Islam")).toBe("nayem-islam");
    expect(sanitizeSlug("  Jane!!!Doe  ")).toBe("jane-doe");
    expect(sanitizeSlug("")).toBe("user");
    expect(sanitizeSlug(null)).toBe("user");
  });

  it("caps length", () => {
    expect(sanitizeSlug("a".repeat(80)).length).toBe(40);
  });
});

describe("emailLocalPart / ownerDirectory", () => {
  it("takes the part before @", () => {
    expect(emailLocalPart("gangsn490@gmail.com")).toBe("gangsn490");
    expect(emailLocalPart("no-at")).toBe("no-at");
  });

  it("builds collision-safe owner folders from email prefix + id6", () => {
    const a = ownerDirectory({ email: "john@a.com" });
    const b = ownerDirectory({ email: "john@b.com" });
    expect(a.startsWith("john_")).toBe(true);
    expect(b.startsWith("john_")).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("ownerId6", () => {
  it("uses userId hex when present", () => {
    expect(ownerId6({ userId: "a8f31c00-1234-7000-8000-000000000001", email: "x@y.com" })).toBe("a8f31c");
  });

  it("hashes guest email stably", () => {
    const a = ownerId6({ email: "Guest@Example.com" });
    const b = ownerId6({ email: "guest@example.com" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{6}$/);
  });
});

describe("buildDocumentStorageKey", () => {
  const createdAt = new Date("2026-11-16T09:29:00.000Z");

  it("builds documents/{prefix}_{id6}/{year}/{month}/{type}_{seq}.pdf", () => {
    const key = buildDocumentStorageKey({
      createdAt,
      email: "nayem.islam@example.com",
      userId: "a8f31c00-1234-7000-8000-000000000001",
      type: "paystub",
      sequence: 1,
    });
    expect(key).toBe("documents/nayem-islam_a8f31c/2026/11/paystub_001.pdf");
    expect(isCurrentDocumentStorageKey(key)).toBe(true);
  });

  it("builds guest paths from email local-part", () => {
    const id6 = ownerId6({ email: "gangsn490@gmail.com" });
    const key = buildDocumentStorageKey({
      createdAt,
      email: "gangsn490@gmail.com",
      type: "paystub",
      sequence: 3,
    });
    expect(key).toBe(`documents/gangsn490_${id6}/2026/11/paystub_003.pdf`);
  });

  it("maps document types to file prefixes", () => {
    expect(filePrefixForType("direct_deposit")).toBe("direct_deposit");
    expect(
      buildDocumentStorageKey({
        createdAt,
        email: "a@b.com",
        type: "w2",
        sequence: 12,
      }),
    ).toMatch(/\/w2_012\.pdf$/);
  });

  it("rejects legacy UUID and dated-name paths", () => {
    expect(
      isCurrentDocumentStorageKey(
        "documents/2026/11/01a1dec6-9b47-73a9-a42a-b13dc9378628/01a1dec6-9c56-7280-995d-da1b7aae89e6.pdf",
      ),
    ).toBe(false);
    expect(
      isCurrentDocumentStorageKey("documents/2026/11/2026-11-15_nayem-islam_01a1de/doc_01a1dec6.pdf"),
    ).toBe(false);
  });
});
