import { describe, expect, it, vi } from "vitest";
import {
  CatalogService,
  type NewTemplate,
  type ProductRepository,
  type TemplateRepository,
  type TemplateWithUsage,
} from "../../src/modules/catalog/index.ts";
import type { ObjectStorage } from "../../src/integrations/storage.ts";

const variant = { headerVariant: "boxed", netPayVariant: "blue", tableVariant: "solid-dark" } as const;

const row = (code: string, p: Partial<TemplateWithUsage> = {}): TemplateWithUsage => ({
  id: `id-${code}`,
  code,
  documentType: "paystub",
  title: `Template ${code}`,
  subtitle: null,
  renderer: "variant",
  variant,
  isActive: true,
  isDefault: false,
  sortOrder: 0,
  previewImageKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  usage: { documents: 0 },
  ...p,
});

const input = (p: Partial<NewTemplate> = {}): NewTemplate => ({
  code: "custom-1",
  documentType: "paystub",
  renderer: "variant",
  variant,
  title: "Custom",
  subtitle: null,
  sortOrder: 0,
  isActive: true,
  ...p,
});

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

function setup(rows: TemplateWithUsage[], { deleteResult = true, createResult = true } = {}) {
  const repo = {
    findById: vi.fn(async (id: string) => rows.find((r) => r.id === id) ?? null),
    findWithUsage: vi.fn(async (id: string) => rows.find((r) => r.id === id) ?? null),
    create: vi.fn(async (t: NewTemplate) => (createResult ? row(t.code, t) : null)),
    update: vi.fn(async (id: string, data: object) => ({ ...rows.find((r) => r.id === id)!, ...data })),
    delete: vi.fn(async () => deleteResult),
  };
  const storage = { put: vi.fn(async () => {}), get: vi.fn(), delete: vi.fn(async () => {}), presignDownload: vi.fn() };
  const service = new CatalogService({} as ProductRepository, repo as unknown as TemplateRepository, storage as ObjectStorage);
  return { repo, storage, service };
}

describe("CatalogService admin template rules", () => {
  it("creates a template with a supported layout", async () => {
    const { service, repo } = setup([]);
    await expect(service.createTemplate(input())).resolves.toMatchObject({ code: "custom-1" });
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it.each([
    ["an unknown renderer", input({ renderer: "html-upload" }), "renderer"],
    ["a renderer of another document type", input({ documentType: "w2", renderer: "variant" }), "renderer"],
    ["a variant on a full-page layout", input({ renderer: "check-statement" }), "variant"],
    ["a missing variant on a styled layout", input({ variant: null }), "variant"],
  ])("rejects %s", async (_label, body, field) => {
    const { service, repo } = setup([]);
    await expect(service.createTemplate(body)).rejects.toMatchObject({ status: 422, errors: { [field]: [expect.any(String)] } });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("returns 409 for a duplicate code", async () => {
    const { service } = setup([], { createResult: false });
    await expect(service.createTemplate(input())).rejects.toMatchObject({ status: 409, code: "TEMPLATE_CODE_TAKEN" });
  });

  it("deletes an unused custom template and its preview image", async () => {
    const { service, repo, storage } = setup([row("custom-1", { previewImageKey: "template-previews/a.webp" })]);
    await expect(service.deleteTemplate("id-custom-1")).resolves.toMatchObject({ code: "custom-1" });
    expect(repo.delete).toHaveBeenCalledWith("id-custom-1");
    expect(storage.delete).toHaveBeenCalledWith("template-previews/a.webp");
  });

  it.each([
    ["a built-in template", row("01"), "TEMPLATE_PROTECTED"],
    ["the default template", row("custom-1", { isDefault: true }), "TEMPLATE_IS_DEFAULT"],
    ["a template used by documents", row("custom-1", { usage: { documents: 3 } }), "TEMPLATE_IN_USE"],
  ])("never deletes %s", async (_label, t, code) => {
    const { service, repo } = setup([t]);
    await expect(service.deleteTemplate(t.id)).rejects.toMatchObject({ status: 409, code });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("maps a foreign-key race on delete to 409", async () => {
    const { service } = setup([row("custom-1")], { deleteResult: false });
    await expect(service.deleteTemplate("id-custom-1")).rejects.toMatchObject({ status: 409, code: "TEMPLATE_IN_USE" });
  });

  it("returns 404 for an unknown template", async () => {
    const { service } = setup([]);
    await expect(service.deleteTemplate("nope")).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ["a built-in template", row("01")],
    ["a template used by documents", row("custom-1", { usage: { documents: 1 } })],
  ])("locks the layout of %s", async (_label, t) => {
    const { service, repo } = setup([t]);
    await expect(service.updateTemplate(t.id, { variant })).rejects.toMatchObject({ status: 409, code: "TEMPLATE_LAYOUT_LOCKED" });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("still renames and deactivates built-in templates", async () => {
    const { service, repo } = setup([row("02")]);
    await service.updateTemplate("id-02", { title: "Renamed", isActive: false });
    expect(repo.update).toHaveBeenCalledWith("id-02", { title: "Renamed", isActive: false });
  });

  it("refuses to deactivate the default template", async () => {
    const { service } = setup([row("custom-1", { isDefault: true })]);
    await expect(service.updateTemplate("id-custom-1", { isActive: false })).rejects.toMatchObject({ status: 422 });
  });

  it("stores a re-encoded preview under a fresh key and removes the old one", async () => {
    const { service, storage, repo } = setup([row("custom-1", { previewImageKey: "template-previews/old.webp" })]);
    await service.setTemplatePreview("id-custom-1", PNG);
    const [[key, body, type]] = storage.put.mock.calls as unknown as [[string, Buffer, string]];
    expect(key).toMatch(/^template-previews\/[0-9a-f-]{36}\.webp$/);
    expect(body.toString("ascii", 8, 12)).toBe("WEBP");
    expect(type).toBe("image/webp");
    expect(repo.update).toHaveBeenCalledWith("id-custom-1", { previewImageKey: key });
    expect(storage.delete).toHaveBeenCalledWith("template-previews/old.webp");
  });

  it("rejects non-image uploads by content, not by name", async () => {
    const { service, storage } = setup([row("custom-1")]);
    await expect(service.setTemplatePreview("id-custom-1", Buffer.from("<svg onload=alert(1)>"))).rejects.toMatchObject({
      status: 422,
      errors: { image: [expect.any(String)] },
    });
    expect(storage.put).not.toHaveBeenCalled();
  });
});
