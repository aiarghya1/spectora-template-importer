/**
 * Independent preservation check. Re-reads the spreadsheet with its own reader and confirms that
 * every data row landed where the parse result says, with its text intact and in order.
 * It deliberately does not reuse the parser's row walk, so a parser bug shows up as a mismatch.
 * Used by tests and `npm run verify:export`.
 */
import * as XLSX from "xlsx";
import { htmlToText } from "../html/sanitize";
import { findHeaderRow, planColumns } from "./columns";
import type { FileKind } from "./file-check";
import type { ParsedComment, ParsedItem, ParsedSection, ParseSuccess } from "./types";

export interface Mismatch {
  row: number;
  field: string;
  expected: string;
  actual: string;
}

export interface PreservationReport {
  dataRows: number;
  commentRowsChecked: number;
  structureRowsChecked: number;
  reportedRows: number;
  mismatches: Mismatch[];
  unaccountedRows: number[];
}

const MAX_MISMATCHES = 200;
const toText = (v: unknown) =>
  v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v).replace(/\r\n?/g, "\n");
const filled = (s: string) => s.trim() !== "";
/** What a reader sees: tags removed, whitespace collapsed. Scripts/styles never count as visible text. */
const visibleText = (html: string) => htmlToText(html).replace(/\s+/g, " ").trim();

export function verifyPreservation(bytes: Uint8Array, kind: FileKind, parse: ParseSuccess): PreservationReport {
  const workbook =
    kind === "csv"
      ? XLSX.read(new TextDecoder().decode(bytes).replace(/^﻿/, ""), { type: "string", raw: true, dense: true })
      : XLSX.read(bytes, { type: "array", dense: true, cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  // Only called with a successful parse of these bytes, so the sheet has a range and a header row.
  const range = XLSX.utils.decode_range(sheet["!ref"] as string);
  const rows = XLSX.utils
    .sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true })
    .map((r) => r.map(toText));
  const headerIndex = findHeaderRow(rows.slice(0, 20));
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const { columns, fieldIndex } = planColumns(rows[headerIndex], width, range.s.c);

  const report: PreservationReport = {
    dataRows: 0,
    commentRowsChecked: 0,
    structureRowsChecked: 0,
    reportedRows: 0,
    mismatches: [],
    unaccountedRows: [],
  };
  const mismatch = (row: number, field: string, expected: string, actual: string) => {
    if (report.mismatches.length < MAX_MISMATCHES) report.mismatches.push({ row, field, expected, actual });
  };

  // Index the parse result.
  const commentsByRow = new Map<number, { section: ParsedSection; item: ParsedItem; comment: ParsedComment }>();
  const sectionsByStartRow = new Map<number, ParsedSection>();
  const itemsByStartRow = new Map<number, { section: ParsedSection; item: ParsedItem }>();
  for (const section of parse.sections) {
    if (sectionsByStartRow.has(section.source_row)) mismatch(section.source_row, "section source row", "unique", "duplicate");
    sectionsByStartRow.set(section.source_row, section);
    for (const item of section.items) {
      if (itemsByStartRow.has(item.source_row)) mismatch(item.source_row, "item source row", "unique", "duplicate");
      itemsByStartRow.set(item.source_row, { section, item });
      let previousRow = -Infinity;
      for (const comment of item.comments) {
        if (commentsByRow.has(comment.source_row)) mismatch(comment.source_row, "comment source row", "unique", "duplicate");
        commentsByRow.set(comment.source_row, { section, item, comment });
        if (comment.source_row <= previousRow) {
          mismatch(comment.source_row, "order", `after row ${previousRow}`, `row ${comment.source_row}`);
        }
        previousRow = comment.source_row;
      }
    }
  }
  const reportedRows = new Set(parse.issues.filter((i) => i.severity === "error" && i.source_row !== null).map((i) => i.source_row as number));

  const get = (cells: string[], field: keyof typeof fieldIndex) => {
    const index = fieldIndex[field];
    return index === undefined ? "" : cells[index]; // defval pads every row to the sheet width
  };

  let lastSection: string | null = null;
  let lastItem: string | null = null;
  let activeSection: ParsedSection | null = null;
  let activeItem: ParsedItem | null = null;
  const matchedSections = new Set<ParsedSection>();
  const matchedItems = new Set<ParsedItem>();
  const matchedComments = new Set<ParsedComment>();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = range.s.r + i + 1;
    const cells = rows[i];
    if (!cells.some(filled)) continue;
    report.dataRows++;

    if (reportedRows.has(row)) {
      report.reportedRows++;
      continue;
    }

    const rawSection = get(cells, "section");
    const rawItem = get(cells, "item");
    const section: string | null = rawSection.trim() || lastSection;
    const sectionOnly = filled(rawSection) && cells.filter(filled).length === 1;
    const item: string | null = sectionOnly ? null : rawItem.trim() || (section === lastSection ? lastItem : null);

    const extras = columns.filter((c) => c.role === "extras" && filled(cells[c.index]));
    const title = get(cells, "title");
    const body = get(cells, "body");
    const type = get(cells, "type").trim();
    const hasComment = filled(title) || filled(body) || type !== "" || extras.length > 0;

    if (!section || (!sectionOnly && !item)) {
      report.unaccountedRows.push(row);
      continue;
    }
    // Explicit standalone declarations are boundaries even for adjacent groups
    // with identical names; matching text alone is not evidence of identity.
    const sectionChanged = section !== lastSection || sectionOnly;
    if (sectionChanged) {
      activeSection = sectionsByStartRow.get(row) ?? null;
      if (activeSection?.name !== section) mismatch(row, "section", section, activeSection?.name ?? "(missing)");
      if (activeSection) matchedSections.add(activeSection);
      activeItem = null;
    }
    if (item === null) {
      activeItem = null;
    } else if (sectionChanged || item !== lastItem || activeItem === null ||
      (filled(rawItem) && !hasComment)) {
      const started = itemsByStartRow.get(row);
      activeItem = started?.item ?? null;
      if (activeItem?.name !== item || started?.section !== activeSection) {
        mismatch(row, "item", item, activeItem?.name ?? "(missing)");
      }
      if (activeItem) matchedItems.add(activeItem);
    }
    lastSection = section;
    lastItem = item;

    if (!hasComment) {
      report.structureRowsChecked++;
      continue;
    }

    const stored = commentsByRow.get(row);
    if (!stored) {
      report.unaccountedRows.push(row);
      continue;
    }
    report.commentRowsChecked++;
    const { comment } = stored;
    matchedComments.add(comment);
    if (stored.section !== activeSection || stored.section.name !== section) {
      mismatch(row, "section", section, stored.section.name);
    }
    if (stored.item !== activeItem || stored.item.name !== item) {
      mismatch(row, "item", String(item), stored.item.name); // item is set on comment rows
    }
    if (comment.title !== title) mismatch(row, "title", title, comment.title);
    if (visibleText(comment.body_html) !== visibleText(body)) mismatch(row, "text", visibleText(body), visibleText(comment.body_html));
    if ((comment.comment_type ?? "") !== type) mismatch(row, "type", type, comment.comment_type ?? "");
    for (const column of extras) {
      const expected = cells[column.index];
      if (comment.extras[column.extrasKey] !== expected) mismatch(row, column.extrasKey, expected, comment.extras[column.extrasKey] ?? "(missing)");
    }
    if (Object.keys(comment.extras).length !== extras.length) {
      mismatch(row, "extras", `${extras.length} fields`, `${Object.keys(comment.extras).length} fields`);
    }
  }

  // Sections must appear in order of their first row.
  parse.sections.forEach((s, index) => {
    if (!matchedSections.has(s)) mismatch(s.source_row, "extra section", "no source declaration", s.name);
    const previous = parse.sections[index - 1];
    if (previous && s.source_row <= previous.source_row) mismatch(s.source_row, "section order", previous.name, s.name);
    s.items.forEach((item, itemIndex) => {
      if (!matchedItems.has(item)) mismatch(item.source_row, "extra item", "no source declaration", item.name);
      const previousItem = s.items[itemIndex - 1];
      if (previousItem && item.source_row <= previousItem.source_row) {
        mismatch(item.source_row, "item order", previousItem.name, item.name);
      }
      for (const comment of item.comments) {
        if (!matchedComments.has(comment)) mismatch(comment.source_row, "extra comment", "no source row", comment.title);
      }
    });
  });

  return report;
}
