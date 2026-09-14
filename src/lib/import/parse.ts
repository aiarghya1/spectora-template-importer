/**
 * Spectora "Export HTML Text" spreadsheet → structured template.
 * Pure and deterministic: bytes in, ParseResult out, no I/O.
 * Rules this must keep: docs/import-invariants.md. Column spec: docs/spectora-export-format.md.
 */
import * as XLSX from "xlsx";
import { describeChanges, isSignificantChange, sanitizeForStorage } from "../html/sanitize";
import { findHeaderRow, normalizeHeader, ORDER_HEADERS, planColumns, type Field } from "./columns";
import type { FileKind } from "./file-check";
import type {
  ImportIssue,
  IssueCategory,
  ParseFailure,
  ParseResult,
  ParsedItem,
  ParsedSection,
  ParseStats,
  Severity,
} from "./types";
import { MAX_UNCOMPRESSED_BYTES, zipDeclaredUncompressedSize } from "./zip-guard";

export const LIMITS = {
  dataRows: 50_000,
  rowIssues: 2_000,
  name: 500,
  title: 1_000,
  body: 200_000,
  type: 100,
  headerScanRows: 20,
  detailRows: 200,
  detailValue: 2_000,
} as const;

type GroupedCode =
  | "section_filled_down"
  | "item_filled_down"
  | "section_not_contiguous"
  | "item_not_contiguous"
  | "names_trimmed"
  | "empty_comment_text"
  | "order_column_differs";

const GROUPED: Record<GroupedCode, { severity: Severity; category: IssueCategory; message: (n: number) => string }> = {
  section_filled_down: {
    severity: "info",
    category: "structure",
    message: (n) => `${n} row(s) had a blank Section Name and were placed in the section above them.`,
  },
  item_filled_down: {
    severity: "info",
    category: "structure",
    message: (n) => `${n} row(s) had a blank Item Name and were placed in the item above them.`,
  },
  section_not_contiguous: {
    severity: "warning",
    category: "structure",
    message: (n) =>
      `${n} row(s) belong to a section that already appeared earlier in the file; they were grouped under its first appearance.`,
  },
  item_not_contiguous: {
    severity: "warning",
    category: "structure",
    message: (n) =>
      `${n} row(s) belong to an item that already appeared earlier in its section; they were grouped under its first appearance.`,
  },
  names_trimmed: {
    severity: "info",
    category: "structure",
    message: (n) => `Leading or trailing spaces were removed from section or item names on ${n} row(s).`,
  },
  empty_comment_text: {
    severity: "info",
    category: "missing_in_export",
    message: (n) => `${n} comment(s) have no Comment Text in the export.`,
  },
  order_column_differs: {
    severity: "warning",
    category: "structure",
    message: (n) =>
      `The Order column disagrees with row order on ${n} row(s). Row order was kept; Order values are preserved as data.`,
  },
};

type ItemBuilder = ParsedItem;
type SectionBuilder = ParsedSection & { itemByName: Map<string, ItemBuilder> };

function fail(code: ParseFailure["code"], message: string, detail?: Record<string, unknown>): ParseFailure {
  return detail ? { ok: false, code, message, detail } : { ok: false, code, message };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.replace(/\r\n?/g, "\n");
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

const isFilled = (value: string | undefined) => value !== undefined && value.trim() !== "";
const clip = (value: string) =>
  value.length > LIMITS.detailValue ? `${value.slice(0, LIMITS.detailValue)}… [truncated]` : value;

function readWorkbook(bytes: Uint8Array, kind: FileKind): { ok: true; workbook: XLSX.WorkBook } | ParseFailure {
  if (kind === "xlsx") {
    const size = zipDeclaredUncompressedSize(bytes);
    if (size === null) {
      return fail("unreadable", "This .xlsx file is damaged or incomplete. Try exporting it from Spectora again.");
    }
    if (size > MAX_UNCOMPRESSED_BYTES) {
      return fail("too_large_uncompressed", "This spreadsheet expands to more data than we can safely import (60 MB).");
    }
  }

  const options: XLSX.ParsingOptions = {
    dense: true,
    cellDates: true,
    cellHTML: false,
    cellFormula: false,
    // Stop reading past the row cap instead of materialising a huge sheet.
    sheetRows: LIMITS.dataRows + LIMITS.headerScanRows + 1,
  };
  try {
    if (kind === "csv") {
      const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
      return { ok: true, workbook: XLSX.read(text, { ...options, type: "string", raw: true }) };
    }
    return { ok: true, workbook: XLSX.read(bytes, { ...options, type: "array" }) };
  } catch (error) {
    if (error instanceof Error && /password|encrypt/i.test(error.message)) {
      return fail("password_protected", "This spreadsheet is password-protected. Remove the password and upload it again.");
    }
    return fail("unreadable", "We couldn't read this spreadsheet. It may be damaged, or not a real Excel/CSV file.");
  }
}

export interface ParseInput {
  bytes: Uint8Array;
  filename: string;
  kind: FileKind;
}

export function templateNameFromFilename(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim();
  return (base || "Imported template").slice(0, 200);
}

export function parseSpectoraExport({ bytes, filename, kind }: ParseInput): ParseResult {
  const read = readWorkbook(bytes, kind);
  if (!read.ok) return read;
  const { workbook } = read;

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return fail("no_sheets", "The spreadsheet has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  const ref = sheet?.["!ref"];
  if (!ref) return fail("empty_sheet", `The first sheet ("${sheetName}") is empty.`);

  const range = XLSX.utils.decode_range(ref);
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true });
  const text = rawRows.map((row) => (Array.isArray(row) ? row.map(cellText) : []));
  const rowNumber = (index: number) => range.s.r + index + 1;

  const headerIndex = findHeaderRow(text.slice(0, LIMITS.headerScanRows));
  if (headerIndex < 0) {
    const firstRow = text.find((row) => row.some(isFilled)) ?? [];
    return fail(
      "missing_required_columns",
      "Couldn't find the Section Name and Item Name columns. Is this a Spectora template export?",
      { foundHeaders: firstRow.filter(isFilled).slice(0, 40).map(clip) },
    );
  }
  if (text.length - headerIndex - 1 > LIMITS.dataRows) {
    return fail("too_many_rows", `The template has more than ${LIMITS.dataRows.toLocaleString("en-US")} rows, which is over our import limit.`);
  }

  const width = text.reduce((max, row) => Math.max(max, row.length), 0);
  const { columns, fieldIndex } = planColumns(text[headerIndex], width, range.s.c);
  if (fieldIndex.title === undefined && fieldIndex.body === undefined) {
    return fail("no_comment_columns", "Found Section and Item columns but no Comment Name or Comment Text column.", {
      foundHeaders: columns.map((c) => c.header).filter(Boolean),
    });
  }
  const orderColumn = columns.find((c) => c.role === "extras" && ORDER_HEADERS.has(normalizeHeader(c.header)));

  const stats: ParseStats = {
    sourceRows: text.length,
    headerRow: rowNumber(headerIndex),
    dataRows: 0,
    blankRows: 0,
    skippedRows: 0,
    itemOnlyRows: 0,
    sectionOnlyRows: 0,
    sections: 0,
    items: 0,
    comments: 0,
    nonEmptyCells: 0,
    cellsStored: 0,
    cellsInExtras: 0,
    cellsReported: 0,
  };

  const rowIssues: ImportIssue[] = [];
  let suppressedIssues = 0;
  const addRowIssue = (issue: ImportIssue) => {
    if (rowIssues.length < LIMITS.rowIssues) rowIssues.push(issue);
    else suppressedIssues++;
  };

  const groupRows = new Map<GroupedCode, number[]>();
  const groupCounts = new Map<GroupedCode, number>();
  const group = (code: GroupedCode, row: number) => {
    groupCounts.set(code, (groupCounts.get(code) ?? 0) + 1);
    const rows = groupRows.get(code) ?? [];
    if (rows.length < LIMITS.detailRows) rows.push(row);
    groupRows.set(code, rows);
  };

  const rowDetail = (cells: string[]) =>
    Object.fromEntries(
      columns
        .filter((c) => isFilled(cells[c.index]))
        .map((c) => [c.role === "extras" ? c.extrasKey : c.header, clip(cells[c.index])]),
    );

  // Content above the header row (e.g. a title line) is not template data, but it is not hidden either.
  for (let i = 0; i < headerIndex; i++) {
    const values = text[i].filter(isFilled);
    if (values.length === 0) continue;
    stats.nonEmptyCells += values.length;
    stats.cellsReported += values.length;
    addRowIssue({
      source_row: rowNumber(i),
      severity: "info",
      category: "structure",
      code: "row_above_header",
      message: "Content above the header row was not imported as template data.",
      detail: { values: values.map(clip) },
    });
  }

  const sections: SectionBuilder[] = [];
  const sectionByName = new Map<string, SectionBuilder>();
  const columnValues = new Array<number>(width).fill(0);
  const lastOrder = new Map<ItemBuilder, number>();
  let lastSection: SectionBuilder | null = null;
  let lastItem: ItemBuilder | null = null;

  for (let i = headerIndex + 1; i < text.length; i++) {
    const row = rowNumber(i);
    const cells = columns.map((c) => text[i][c.index] ?? "");
    const filledCount = cells.filter(isFilled).length;
    if (filledCount === 0) {
      stats.blankRows++;
      continue;
    }
    stats.dataRows++;
    stats.nonEmptyCells += filledCount;

    const get = (field: Field) => {
      const index = fieldIndex[field];
      return index === undefined ? "" : cells[index];
    };
    const skip = (code: string, message: string) => {
      stats.skippedRows++;
      stats.cellsReported += filledCount;
      addRowIssue({ source_row: row, severity: "error", category: "structure", code, message, detail: { values: rowDetail(cells) } });
    };

    const rawSection = get("section");
    const rawItem = get("item");
    let sectionName = rawSection.trim();
    let itemName = rawItem.trim();

    // A row with only a Section Name declares a section (possibly with no items yet).
    const sectionOnly = isFilled(rawSection) && filledCount === 1;

    let sectionFilledDown = false;
    if (!sectionName) {
      if (!lastSection) {
        skip("missing_section", "Row has content but no Section Name, and there is no section above it.");
        continue;
      }
      sectionName = lastSection.name;
      sectionFilledDown = true;
    }

    let itemFilledDown = false;
    if (!itemName && !sectionOnly) {
      if (!lastItem || !lastSection || lastSection.name !== sectionName) {
        skip("missing_item", "Row has content but no Item Name, and there is no item above it in the same section.");
        continue;
      }
      itemName = lastItem.name;
      itemFilledDown = true;
    }

    const title = get("title");
    const bodyRaw = get("body");
    const commentType = get("type").trim();
    const sanitized = sanitizeForStorage(bodyRaw);

    const lengthChecks: Array<[string, number, string]> = [
      [sectionName, LIMITS.name, "Section Name"],
      [itemName, LIMITS.name, "Item Name"],
      [title, LIMITS.title, "Comment Name"],
      [sanitized.html, LIMITS.body, "Comment Text"],
      [commentType, LIMITS.type, "Comment Type"],
    ];
    const tooLong = lengthChecks.find(([value, max]) => value.length > max);
    if (tooLong) {
      skip("value_too_long", `${tooLong[2]} is longer than ${tooLong[1].toLocaleString("en-US")} characters, which this app can't store.`);
      continue;
    }

    // Row accepted from here on.
    if (sectionFilledDown) group("section_filled_down", row);
    if (itemFilledDown) group("item_filled_down", row);
    if ((isFilled(rawSection) && rawSection !== sectionName) || (isFilled(rawItem) && rawItem !== itemName)) {
      group("names_trimmed", row);
    }
    cells.forEach((value, index) => {
      if (isFilled(value)) columnValues[index]++;
    });

    let section = sectionByName.get(sectionName);
    if (!section) {
      section = { name: sectionName, source_row: row, extras: {}, items: [], itemByName: new Map() };
      sections.push(section);
      sectionByName.set(sectionName, section);
    } else if (section !== lastSection) {
      group("section_not_contiguous", row);
    }
    stats.cellsStored += isFilled(rawSection) ? 1 : 0;

    if (sectionOnly) {
      stats.sectionOnlyRows++;
      lastSection = section;
      lastItem = null;
      continue;
    }

    let item = section.itemByName.get(itemName);
    if (!item) {
      item = { name: itemName, source_row: row, extras: {}, comments: [] };
      section.items.push(item);
      section.itemByName.set(itemName, item);
    } else if (item !== lastItem) {
      group("item_not_contiguous", row);
    }
    lastSection = section;
    lastItem = item;
    stats.cellsStored += isFilled(rawItem) ? 1 : 0;

    const extras: Record<string, string> = {};
    for (const column of columns) {
      if (column.role === "extras" && isFilled(cells[column.index])) extras[column.extrasKey] = cells[column.index];
    }
    const extrasCount = Object.keys(extras).length;

    if (!isFilled(title) && !isFilled(bodyRaw) && !commentType && extrasCount === 0) {
      stats.itemOnlyRows++;
      continue;
    }

    stats.cellsStored += (isFilled(title) ? 1 : 0) + (isFilled(bodyRaw) ? 1 : 0) + (commentType ? 1 : 0);
    stats.cellsInExtras += extrasCount;

    if (!isFilled(bodyRaw)) group("empty_comment_text", row);
    if (sanitized.changes.length > 0) {
      addRowIssue({
        source_row: row,
        severity: sanitized.changes.some(isSignificantChange) ? "warning" : "info",
        category: "sanitized",
        code: "html_sanitized",
        message: describeChanges(sanitized.changes),
        detail: { changes: sanitized.changes },
      });
    }
    if (orderColumn && isFilled(cells[orderColumn.index])) {
      const order = Number(cells[orderColumn.index]);
      if (Number.isFinite(order)) {
        const previous = lastOrder.get(item);
        if (previous !== undefined && order < previous) group("order_column_differs", row);
        lastOrder.set(item, order);
      }
    }

    item.comments.push({ title, body_html: sanitized.html, comment_type: commentType || null, source_row: row, extras });
  }

  if (sections.length === 0) {
    return stats.dataRows === 0
      ? fail("no_data_rows", "The export has a header row but no template rows.")
      : fail("no_importable_rows", "None of the rows could be imported.", { issues: rowIssues.slice(0, 50) });
  }

  const templateName = templateNameFromFilename(filename);
  const fileIssues: ImportIssue[] = [
    {
      source_row: null,
      severity: "info",
      category: "missing_in_export",
      code: "template_name_from_filename",
      message: `The export doesn't include a template name, so it was named after the file ("${templateName}"). You can rename it.`,
      detail: {},
    },
  ];

  const columnSummaries = columns.map(({ index, ...column }) => ({ ...column, values: columnValues[index] }));
  for (const column of columnSummaries) {
    if (column.role !== "extras" || column.values === 0) continue;
    const label = column.header ? `"${column.header}" (column ${column.letter})` : `Unlabelled column ${column.letter}`;
    fileIssues.push({
      source_row: null,
      severity: column.known ? "info" : "warning",
      category: "unsupported",
      code: column.known ? "column_preserved" : "unknown_column_preserved",
      message: `${label}: ${column.note ?? "Not a recognised Spectora column."} ${column.values} value(s) kept as read-only data on their comments.`,
      detail: { column: column.letter, header: column.header, key: column.extrasKey, values: column.values },
    });
  }

  for (const name of workbook.SheetNames.slice(1)) {
    const otherRef = workbook.Sheets[name]?.["!ref"];
    if (!otherRef) continue;
    fileIssues.push({
      source_row: null,
      severity: "warning",
      category: "unsupported",
      code: "extra_sheet_ignored",
      message: `Sheet "${name}" was not imported; only the first sheet ("${sheetName}") is read.`,
      detail: { sheet: name, range: otherRef },
    });
  }

  for (const [code, count] of groupCounts) {
    const def = GROUPED[code];
    fileIssues.push({
      source_row: null,
      severity: def.severity,
      category: def.category,
      code,
      message: def.message(count),
      detail: { count, rows: groupRows.get(code) ?? [] },
    });
  }

  if (suppressedIssues > 0) {
    fileIssues.push({
      source_row: null,
      severity: "warning",
      category: "structure",
      code: "issues_truncated",
      message: `${suppressedIssues} more row issue(s) were found but not listed individually.`,
      detail: { suppressed: suppressedIssues },
    });
  }

  const parsedSections: ParsedSection[] = sections.map((s) => ({
    name: s.name,
    source_row: s.source_row,
    extras: s.extras,
    items: s.items,
  }));
  stats.sections = parsedSections.length;
  stats.items = parsedSections.reduce((n, s) => n + s.items.length, 0);
  stats.comments = parsedSections.reduce((n, s) => n + s.items.reduce((m, i) => m + i.comments.length, 0), 0);

  return {
    ok: true,
    templateName,
    sheetName,
    columns: columnSummaries,
    sections: parsedSections,
    issues: [...fileIssues, ...rowIssues],
    stats,
  };
}
