import type { DocumentType } from "../../../generated/prisma/enums.ts";
import type { PageRequest } from "../../../shared/http/pagination.ts";
import type { TemplateVariant } from "../catalog.schemas.ts";

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
  previewImageKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Documents rendered with a template; they block deletion and layout changes. */
export interface TemplateUsage {
  documents: number;
}

export type TemplateWithUsage = TemplateRow & { usage: TemplateUsage };

export interface TemplateFilter {
  q?: string;
  documentType?: DocumentType;
  isActive?: boolean;
}

export interface NewTemplate {
  code: string;
  documentType: DocumentType;
  renderer: string;
  variant: TemplateVariant | null;
  title: string;
  subtitle: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface TemplateUpdate {
  title?: string;
  subtitle?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  variant?: TemplateVariant;
  previewImageKey?: string | null;
}

export interface TemplateRepository {
  list(options: { activeOnly: boolean; documentType?: DocumentType }): Promise<TemplateRow[]>;
  search(filter: TemplateFilter, page: PageRequest): Promise<{ items: TemplateWithUsage[]; total: number }>;
  findById(id: string): Promise<TemplateRow | null>;
  findWithUsage(id: string): Promise<TemplateWithUsage | null>;
  /** Returns null when the code is already taken for this document type. */
  create(input: NewTemplate): Promise<TemplateRow | null>;
  update(id: string, input: TemplateUpdate): Promise<TemplateRow>;
  /** In one transaction: unsets the current default of the same type, then sets this one. */
  setDefault(id: string): Promise<TemplateRow>;
  /** False when the row is still referenced (FK restrict) or already gone. */
  delete(id: string): Promise<boolean>;
}
