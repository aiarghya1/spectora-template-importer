/** Shapes produced by the parser and consumed by the preview UI and the import_template RPC. */

export type Severity = "info" | "warning" | "error";
/**
 * missing_in_export — the file itself doesn't contain this information.
 * unsupported      — the file contains it, but this app doesn't model it (kept as read-only data or reported).
 * sanitized        — content was changed for safety; the change is described.
 * structure        — how rows were grouped/skipped.
 */
export type IssueCategory = "missing_in_export" | "unsupported" | "sanitized" | "structure";

export interface ImportIssue {
  source_row: number | null;
  severity: Severity;
  category: IssueCategory;
  code: string;
  message: string;
  detail: Record<string, unknown>;
}

export interface ParsedComment {
  title: string;
  body_html: string;
  comment_type: string | null;
  source_row: number;
  extras: Record<string, string>;
}

export interface ParsedItem {
  name: string;
  source_row: number;
  extras: Record<string, string>;
  comments: ParsedComment[];
}

export interface ParsedSection {
  name: string;
  source_row: number;
  extras: Record<string, string>;
  items: ParsedItem[];
}

export type ColumnRole = "section" | "item" | "title" | "body" | "type" | "extras";

export interface ColumnSummary {
  letter: string;
  header: string;
  role: ColumnRole;
  extrasKey: string;
  known: boolean;
  note: string | null;
  values: number;
}

export interface ParseStats {
  sourceRows: number;
  headerRow: number;
  dataRows: number;
  blankRows: number;
  skippedRows: number;
  itemOnlyRows: number;
  sectionOnlyRows: number;
  sections: number;
  items: number;
  comments: number;
  /** Conservation: nonEmptyCells === cellsStored + cellsInExtras + cellsReported */
  nonEmptyCells: number;
  cellsStored: number;
  cellsInExtras: number;
  cellsReported: number;
}

export interface ParseSuccess {
  ok: true;
  templateName: string;
  sheetName: string;
  columns: ColumnSummary[];
  sections: ParsedSection[];
  issues: ImportIssue[];
  stats: ParseStats;
}

export type ParseErrorCode =
  | "unreadable"
  | "password_protected"
  | "too_large_uncompressed"
  | "no_sheets"
  | "empty_sheet"
  | "missing_required_columns"
  | "no_comment_columns"
  | "too_many_rows"
  | "no_data_rows"
  | "no_importable_rows";

export interface ParseFailure {
  ok: false;
  code: ParseErrorCode;
  message: string;
  detail?: Record<string, unknown>;
}

export type ParseResult = ParseSuccess | ParseFailure;
