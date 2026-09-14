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
});
