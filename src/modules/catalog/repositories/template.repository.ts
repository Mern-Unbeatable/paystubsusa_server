import type { DocumentType } from "../../../generated/prisma/enums.ts";

export interface TemplateRow {
  id: string;
  code: string;
  documentType: DocumentType;
  title: string;
  subtitle: string | null;
  renderer: string;
  variant: unknown;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
}

export interface TemplateRepository {
  list(options: { activeOnly: boolean; documentType?: DocumentType }): Promise<TemplateRow[]>;
  findById(id: string): Promise<TemplateRow | null>;
  update(id: string, input: { title?: string; subtitle?: string | null; isActive?: boolean; sortOrder?: number }): Promise<TemplateRow>;
  /** In one transaction: unsets the current default of the same type, then sets this one. */
  setDefault(id: string): Promise<TemplateRow>;
}
