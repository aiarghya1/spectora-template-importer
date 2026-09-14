/** View models shared by server queries and client components (no server-only imports here). */
import type { ColumnSummary, ImportIssue, ParseStats } from "@/lib/import/types";

export interface TemplateListRow {
  id: string;
  name: string;
  updatedAt: string;
  copiedFromId: string | null;
  sectionCount: number;
  commentCount: number;
}

export interface SectionSummary {
  id: string;
  name: string;
  version: number;
  itemCount: number;
}

export interface TemplateDetail {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  importId: string | null;
  copiedFrom: { id: string; name: string } | null;
  sections: SectionSummary[];
}

export interface CommentView {
  id: string;
  title: string;
  bodyHtml: string;
  renderedHtml: string;
  commentType: string | null;
  version: number;
  sourceRow: number | null;
  extras: Record<string, string>;
}

export interface ItemView {
  id: string;
  name: string;
  version: number;
  sourceRow: number | null;
  comments: CommentView[];
}

export type IssueWithLocation = ImportIssue & {
  id?: number;
  location?: { sectionId: string; itemId: string } | null;
};

export interface ImportReport {
  id: string;
  filename: string;
  sha256: string;
  createdAt: string;
  sourceRows: number;
  summary: { templateName?: string; sheetName?: string; stats?: ParseStats; columns?: ColumnSummary[] };
  issues: IssueWithLocation[];
  /** Set when this template is a copy: the template the import originally created (null if deleted). */
  originalTemplate: { id: string; name: string } | null;
}
