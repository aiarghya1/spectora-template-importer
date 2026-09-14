/** Human-facing wording for import results. Shared by the import preview and the import report. */
import type { ColumnRole, IssueCategory, Severity } from "./types";

export const ROLE_LABEL: Record<ColumnRole, string> = {
  section: "Section name",
  item: "Item name",
  title: "Comment name",
  body: "Comment text",
  type: "Comment type",
  extras: "Kept as read-only data",
};

export const CATEGORY_LABEL: Record<IssueCategory, { label: string; description: string }> = {
  missing_in_export: {
    label: "Missing from export",
    description: "The file doesn't contain this, so there was nothing to import.",
  },
  unsupported: {
    label: "Not editable here",
    description: "Present in the file and preserved, but this app doesn't let you edit it.",
  },
  sanitized: {
    label: "Formatting changed",
    description: "Comment HTML was changed for safety. Every change is listed.",
  },
  structure: {
    label: "Rows & grouping",
    description: "How rows were grouped, placed or skipped.",
  },
};

export const SEVERITY_LABEL: Record<Severity, string> = { error: "Skipped", warning: "Review", info: "Note" };

export const SEVERITY_STYLE: Record<Severity, string> = {
  error: "bg-red-50 text-red-800 ring-red-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  info: "bg-sky-50 text-sky-900 ring-sky-200",
};

export const FAILURE_TITLE: Record<string, string> = {
  empty_file: "The file is empty",
  too_large: "The file is too large",
  plain_text_export: "That's the plain-text export",
  unsupported_type: "Unsupported file type",
  content_mismatch: "The file doesn't match its extension",
  unreadable: "We couldn't read the spreadsheet",
  password_protected: "The spreadsheet is password-protected",
  too_large_uncompressed: "The spreadsheet is too large",
  no_sheets: "The spreadsheet has no sheets",
  empty_sheet: "The first sheet is empty",
  missing_required_columns: "This doesn't look like a Spectora template export",
  no_comment_columns: "No comment columns found",
  too_many_rows: "Too many rows",
  no_data_rows: "No template rows",
  no_importable_rows: "Nothing could be imported",
  file_changed: "The file changed since the preview",
  rate_limited: "Too many imports",
  quota: "Template limit reached",
  network: "Connection problem",
  unauthenticated: "Signed out",
};
