/**
 * Header recognition for Spectora template exports. Column spec: docs/spectora-export-format.md.
 * Matching is by normalised header text (case, spacing and punctuation ignored), never by position,
 * so reordered or extra columns still import.
 */
import type { ColumnSummary } from "./types";

export type Field = "section" | "item" | "title" | "body" | "type";

export const normalizeHeader = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

const FIELD_ALIASES: Record<Field, readonly string[]> = {
  section: ["sectionname", "section"],
  item: ["itemname", "item"],
  title: ["commentname", "commenttitle", "narrativename", "narrativetitle"],
  body: ["commenttext", "narrativetext", "comment", "narrative"],
  type: ["commenttype", "narrativetype", "type"],
};

const aliasToField = new Map<string, Field>(
  (Object.entries(FIELD_ALIASES) as [Field, readonly string[]][]).flatMap(([field, aliases]) =>
    aliases.map((alias) => [alias, field] as const),
  ),
);

/** Spectora columns we recognise but don't model as editable fields. Kept verbatim in comment extras. */
const KNOWN_UNMODELLED: Array<[RegExp, string]> = [
  [/^category$/, "Defect category (Spectora uses -1 low, 0 medium, 1 high)."],
  [/^(multiplechoiceoptions|unittypeoptions|answertype|defaultvalue2?|defaultunittype)$/, "Information-field answer setting."],
  [/^recommendation$/, "Recommendation setting."],
  [/^defaultlocation$/, "Default location."],
  [/^defaultestimate(min|max)$/, "Default repair estimate."],
  [/^(orderwiitem|order)$/, "Spectora's ordering value; row order is used instead."],
  [/^(locked|simpleformat|disablephotos)$/, "Comment behaviour setting."],
  [/^uses$/, "Usage count."],
  [/^defaultphoto\d+(caption)?$/, "Default photo reference; images are not downloaded or shown."],
  [/^lastmodified$/, "Last-modified timestamp."],
];

export const ORDER_HEADERS = new Set(["orderwiitem", "order"]);

export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** First occurrence of each field in a candidate header row. */
export function mapHeaderRow(cells: string[]): Partial<Record<Field, number>> {
  const mapping: Partial<Record<Field, number>> = {};
  cells.forEach((cell, index) => {
    const field = aliasToField.get(normalizeHeader(cell));
    if (field && mapping[field] === undefined) mapping[field] = index;
  });
  return mapping;
}

/** Index of the first row that has both Section and Item headers, or -1. */
export function findHeaderRow(rows: string[][]): number {
  return rows.findIndex((row) => {
    const mapping = mapHeaderRow(row);
    return mapping.section !== undefined && mapping.item !== undefined;
  });
}

export type ColumnPlan = Omit<ColumnSummary, "values"> & { index: number };

export function planColumns(headerCells: string[], width: number, startColumn: number) {
  const fieldIndex: Partial<Record<Field, number>> = {};
  const usedKeys = new Set<string>();
  const columns: ColumnPlan[] = [];

  for (let index = 0; index < width; index++) {
    const header = (headerCells[index] ?? "").trim();
    const letter = columnLetter(startColumn + index);
    const normalized = normalizeHeader(header);
    const field = aliasToField.get(normalized);

    if (field && fieldIndex[field] === undefined) {
      fieldIndex[field] = index;
      columns.push({ index, letter, header, role: field, extrasKey: header, known: true, note: null });
      continue;
    }

    let key = header || `Column ${letter}`;
    if (field || usedKeys.has(key)) key = `${key} (column ${letter})`;
    usedKeys.add(key);

    const knownNote = KNOWN_UNMODELLED.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
    columns.push({
      index,
      letter,
      header,
      role: "extras",
      extrasKey: key,
      known: knownNote !== null,
      note: field ? `Duplicate "${header}" column; the first one was used.` : knownNote,
    });
  }
  return { columns, fieldIndex };
}
