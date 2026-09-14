import { describe, expect, it } from "vitest";
import { columnLetter, findHeaderRow, mapHeaderRow, normalizeHeader, planColumns } from "../columns";

describe("columns", () => {
  it("normalises headers and finds the header row", () => {
    expect(normalizeHeader(" Order (w/i item) ")).toBe("orderwiitem");
    expect(mapHeaderRow(["Section", "Item", "Comment", "Section Name"])).toEqual({ section: 0, item: 1, body: 2 });
    expect(findHeaderRow([["Title"], ["Section Name", "Item Name"]])).toBe(1);
    expect(findHeaderRow([["Name"]])).toBe(-1);
  });

  it("names columns past Z like a spreadsheet", () => {
    expect([0, 25, 26, 51, 701, 702].map(columnLetter)).toEqual(["A", "Z", "AA", "AZ", "ZZ", "AAA"]);
  });

  it("plans columns wider than the header row as unlabelled extras", () => {
    const { columns, fieldIndex } = planColumns(["Section Name", "Item Name"], 4, 2);
    expect(fieldIndex).toEqual({ section: 0, item: 1 });
    expect(columns.slice(2)).toEqual([
      { index: 2, letter: "E", header: "", role: "extras", extrasKey: "Column E", known: false, note: null },
      { index: 3, letter: "F", header: "", role: "extras", extrasKey: "Column F", known: false, note: null },
    ]);
  });

  it("recognises Spectora's known columns and flags duplicates", () => {
    const { columns } = planColumns(["Section Name", "Item Name", "Default Photo 2 Caption", "Uses", "Item Name", "Uses"], 6, 0);
    expect(columns.map((c) => [c.extrasKey, c.known, c.note])).toEqual([
      ["Section Name", true, null],
      ["Item Name", true, null],
      ["Default Photo 2 Caption", true, "Default photo reference; images are not downloaded or shown."],
      ["Uses", true, "Usage count."],
      ["Item Name (column E)", false, 'Duplicate "Item Name" column; the first one was used.'],
      ["Uses (column F)", true, "Usage count."],
    ]);
  });

  it("recognises explanatory headers from the real HTML-text export without swallowing custom columns", () => {
    const headers = [
      "Section Name", "Item Name", "Comment Type (info, limit, defect)",
      "Category (-1: Low, 0: Med, 1: High)",
      "Multiple Choice Options (comma-separated)",
      "Unit Type Options (numeric answers only, comma-separated)",
      "Recommendation (from list)",
      "Answer Type (boolean, checkbox, date, number, range, text)",
      'Default Value 2 (for "range" types)',
      'Default Unit Type (for "number" and "range" types)',
      "Comment Type (custom)",
    ];
    const { columns, fieldIndex } = planColumns(headers, headers.length, 0);
    expect(fieldIndex.type).toBe(2);
    expect(columns.slice(2, 10).map((column) => [column.role, column.known])).toEqual([
      ["type", true], ...Array.from({ length: 7 }, () => ["extras", true]),
    ]);
    expect(columns[10]).toMatchObject({ role: "extras", known: false });
    expect(mapHeaderRow(headers)).toMatchObject({ section: 0, item: 1, type: 2 });
  });
});
