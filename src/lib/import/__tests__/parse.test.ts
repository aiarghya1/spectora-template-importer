import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseSpectoraExport } from "../parse";
import type { ParseResult, ParseSuccess } from "../types";

const HEADERS = ["Section Name", "Item Name", "Comment Name", "Comment Text", "Comment Type", "Category", "Order (w/i item)"];

function xlsx(rows: unknown[][], extraSheets: Record<string, unknown[][]> = {}): Uint8Array {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Template");
  for (const [name, sheetRows] of Object.entries(extraSheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheetRows), name);
  }
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

const parseXlsx = (rows: unknown[][], extra?: Record<string, unknown[][]>) =>
  parseSpectoraExport({ bytes: xlsx(rows, extra), filename: "InterNACHI Residential.xlsx", kind: "xlsx" });

function ok(result: ParseResult): ParseSuccess {
  if (!result.ok) throw new Error(`expected success, got ${result.code}: ${result.message}`);
  return result;
}

function expectConservation(result: ParseSuccess) {
  const { nonEmptyCells, cellsStored, cellsInExtras, cellsReported } = result.stats;
  expect(cellsStored + cellsInExtras + cellsReported).toBe(nonEmptyCells);
}

const outline = (result: ParseSuccess) =>
  result.sections.map((s) => [s.name, s.items.map((i) => [i.name, i.comments.map((c) => c.title)])]);

const codes = (result: ParseSuccess) => result.issues.map((i) => i.code);

describe("parseSpectoraExport — structure", () => {
  it("preserves hierarchy, order, text and HTML", () => {
    const result = ok(
      parseXlsx([
        HEADERS,
        ["Roof", "Coverings", "Asphalt shingles", "<p>Roof covering is <b>asphalt</b>.</p>", "info", "", 1],
        ["Roof", "Coverings", "Missing shingles", 'Shingles missing. See <a href="https://www.nachi.org">NACHI</a>.', "defect", 1, 2],
        ["Roof", "Flashing", "Rusted", "Flashing is rusted.", "defect", 0, 1],
        ["Exterior", "Siding", "Vinyl", "Vinyl siding 🏠 — “good”", "info", "", 1],
        ["Attic", "Insulation", "Low R-value", "Line one\nLine two", "limit", -1, 1],
      ]),
    );

    expect(outline(result)).toEqual([
      ["Roof", [["Coverings", ["Asphalt shingles", "Missing shingles"]], ["Flashing", ["Rusted"]]]],
      ["Exterior", [["Siding", ["Vinyl"]]]],
      ["Attic", [["Insulation", ["Low R-value"]]]],
    ]);
    const missing = result.sections[0].items[0].comments[1];
    expect(missing).toEqual({
      title: "Missing shingles",
      body_html: 'Shingles missing. See <a href="https://www.nachi.org">NACHI</a>.',
      comment_type: "defect",
      source_row: 3,
      extras: { Category: "1", "Order (w/i item)": "2" },
    });
    expect(result.sections[1].items[0].comments[0].body_html).toBe("Vinyl siding 🏠 — “good”");
    expect(result.sections[2].items[0].comments[0].body_html).toBe("Line one\nLine two");
    expect(result.stats).toMatchObject({ sections: 3, items: 4, comments: 5, dataRows: 5, skippedRows: 0 });
    expect(result.templateName).toBe("InterNACHI Residential");
    expectConservation(result);
  });

  it("is deterministic", () => {
    const bytes = xlsx([HEADERS, ["Roof", "Coverings", "A", "text", "info", "", 1]]);
    const a = parseSpectoraExport({ bytes, filename: "t.xlsx", kind: "xlsx" });
    const b = parseSpectoraExport({ bytes, filename: "t.xlsx", kind: "xlsx" });
    expect(a).toEqual(b);
  });

  it("matches headers regardless of case, spacing, punctuation and column order", () => {
    const result = ok(
      parseXlsx([
        ["COMMENT  TEXT", "item name", "Section_Name", "comment name"],
        ["Body", "Coverings", "Roof", "Title"],
      ]),
    );
    expect(result.sections[0].items[0].comments[0]).toMatchObject({ title: "Title", body_html: "Body" });
  });

  it("fills down blank section and item cells and reports it", () => {
    const result = ok(
      parseXlsx([
        HEADERS,
        ["Roof", "Coverings", "A", "a"],
        ["", "", "B", "b"],
        ["", "Flashing", "C", "c"],
      ]),
    );
    expect(outline(result)).toEqual([["Roof", [["Coverings", ["A", "B"]], ["Flashing", ["C"]]]]]);
    expect(codes(result)).toEqual(expect.arrayContaining(["section_filled_down", "item_filled_down"]));
    expectConservation(result);
  });

  it("groups non-contiguous sections under first appearance and warns", () => {
    const result = ok(
      parseXlsx([
        HEADERS,
        ["Roof", "Coverings", "A", "a"],
        ["Exterior", "Siding", "B", "b"],
        ["Roof", "Coverings", "C", "c"],
      ]),
    );
    expect(outline(result)).toEqual([
      ["Roof", [["Coverings", ["A", "C"]]]],
      ["Exterior", [["Siding", ["B"]]]],
    ]);
    const issue = result.issues.find((i) => i.code === "section_not_contiguous");
    expect(issue).toMatchObject({ severity: "warning", detail: { count: 1, rows: [4] } });
  });

  it("keeps items with no comments and sections with no items", () => {
    const result = ok(parseXlsx([HEADERS, ["Roof", "Coverings"], ["Garage"], ["Garage", "Door", "Dented", "x"]]));
    expect(outline(result)).toEqual([
      ["Roof", [["Coverings", []]]],
      ["Garage", [["Door", ["Dented"]]]],
    ]);
    expect(result.stats).toMatchObject({ itemOnlyRows: 1, sectionOnlyRows: 1 });
    expectConservation(result);
  });

  it("ignores blank rows but counts them", () => {
    const result = ok(parseXlsx([HEADERS, [], ["Roof", "Coverings", "A", "a"], [null, "  "], ["Roof", "Coverings", "B", "b"]]));
    expect(result.stats.blankRows).toBe(2);
    expect(outline(result)).toEqual([["Roof", [["Coverings", ["A", "B"]]]]]);
  });

  it("trims name edges only, and reports it", () => {
    const result = ok(parseXlsx([HEADERS, ["  Roof ", " Coverings", "  Title kept  ", "  body kept  "]]));
    expect(result.sections[0].name).toBe("Roof");
    expect(result.sections[0].items[0].comments[0]).toMatchObject({ title: "  Title kept  ", body_html: "  body kept  " });
    expect(codes(result)).toContain("names_trimmed");
  });

  it("uses row order when the Order column disagrees, and warns", () => {
    const result = ok(parseXlsx([HEADERS, ["Roof", "Coverings", "Second", "b", "", "", 2], ["Roof", "Coverings", "First", "a", "", "", 1]]));
    expect(outline(result)).toEqual([["Roof", [["Coverings", ["Second", "First"]]]]]);
    expect(codes(result)).toContain("order_column_differs");
  });
});

describe("parseSpectoraExport — content that isn't imported is visible", () => {
  it("reports content above the header row", () => {
    const result = ok(parseXlsx([["InterNACHI Residential template"], [], HEADERS, ["Roof", "Coverings", "A", "a"]]));
    expect(result.stats.headerRow).toBe(3);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "row_above_header", source_row: 1, detail: { values: ["InterNACHI Residential template"] } }),
    );
    expectConservation(result);
  });

  it("keeps unknown and duplicate columns as extras and reports them", () => {
    const result = ok(
      parseXlsx([
        ["Section Name", "Item Name", "Comment Name", "Comment Text", "Inspector Notes", "Comment Text", ""],
        ["Roof", "Coverings", "A", "first", "note", "second", "orphan"],
      ]),
    );
    expect(result.sections[0].items[0].comments[0]).toMatchObject({
      body_html: "first",
      extras: { "Inspector Notes": "note", "Comment Text (column F)": "second", "Column G": "orphan" },
    });
    expect(codes(result)).toEqual(expect.arrayContaining(["unknown_column_preserved"]));
    expect(result.issues.filter((i) => i.category === "unsupported")).toHaveLength(3);
    expectConservation(result);
  });

  it("skips rows it cannot place, keeping their values in the issue", () => {
    const result = ok(
      parseXlsx([
        HEADERS,
        ["", "Orphan item", "Lost?", "not lost"],
        ["Roof", "Coverings", "A", "a"],
        ["Exterior", "", "No item", "text"],
      ]),
    );
    const skipped = result.issues.filter((i) => i.severity === "error");
    expect(skipped.map((i) => [i.code, i.source_row])).toEqual([
      ["missing_section", 2],
      ["missing_item", 4],
    ]);
    expect(skipped[0].detail).toEqual({ values: { "Item Name": "Orphan item", "Comment Name": "Lost?", "Comment Text": "not lost" } });
    expect(result.stats.skippedRows).toBe(2);
    expectConservation(result);
  });

  it("skips values too long to store instead of truncating them", () => {
    const result = ok(parseXlsx([HEADERS, ["R".repeat(501), "Item", "A", "a"], ["Roof", "Coverings", "B", "b"]]));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "value_too_long", source_row: 2 }));
    expect(outline(result)).toEqual([["Roof", [["Coverings", ["B"]]]]]);
    expectConservation(result);
  });

  it("sanitises comment HTML and reports each change on its row", () => {
    const result = ok(
      parseXlsx([HEADERS, ["Roof", "Coverings", "XSS", 'Ok<script>alert(1)</script><img src="https://x/y.jpg"><a href="javascript:x">l</a>']]),
    );
    const comment = result.sections[0].items[0].comments[0];
    expect(comment.body_html).toBe("Ok<a>l</a>");
    const issue = result.issues.find((i) => i.code === "html_sanitized");
    expect(issue).toMatchObject({ source_row: 2, severity: "warning", category: "sanitized" });
    expect(issue?.message).toContain("removed image (https://x/y.jpg)");
  });

  it("reports extra sheets and the missing template name", () => {
    const result = ok(parseXlsx([HEADERS, ["Roof", "Coverings", "A", "a"]], { Notes: [["hello"]] }));
    expect(codes(result)).toEqual(expect.arrayContaining(["extra_sheet_ignored", "template_name_from_filename"]));
    expect(result.issues.find((i) => i.code === "template_name_from_filename")?.category).toBe("missing_in_export");
  });
});

describe("parseSpectoraExport — CSV", () => {
  it("handles BOM, quoted commas, quotes and embedded newlines, and keeps values as text", () => {
    const csv =
      "﻿Section Name,Item Name,Comment Name,Comment Text,Category\r\n" +
      'Roof,Coverings,"Shingles, worn","He said ""replace""\r\nnext line",007\r\n';
    const result = ok(parseSpectoraExport({ bytes: new TextEncoder().encode(csv), filename: "t.csv", kind: "csv" }));
    expect(result.sections[0].items[0].comments[0]).toEqual({
      title: "Shingles, worn",
      body_html: 'He said "replace"\nnext line',
      comment_type: null,
      source_row: 2,
      extras: { Category: "007" },
    });
  });
});

describe("parseSpectoraExport — failures", () => {
  it("rejects files without the required columns", () => {
    const result = parseXlsx([["Name", "Description"], ["Roof", "x"]]);
    expect(result).toMatchObject({ ok: false, code: "missing_required_columns", detail: { foundHeaders: ["Name", "Description"] } });
  });

  it("rejects a sheet with section/item columns but no comment columns", () => {
    expect(parseXlsx([["Section Name", "Item Name"], ["Roof", "Coverings"]])).toMatchObject({ ok: false, code: "no_comment_columns" });
  });

  it("rejects a header with no rows, and rows that are all unplaceable", () => {
    expect(parseXlsx([HEADERS])).toMatchObject({ ok: false, code: "no_data_rows" });
    expect(parseXlsx([HEADERS, ["", "", "A", "a"]])).toMatchObject({ ok: false, code: "no_importable_rows" });
  });

  it("rejects damaged xlsx", () => {
    const bytes = xlsx([HEADERS, ["Roof", "Coverings", "A", "a"]]);
    const truncated = bytes.slice(0, Math.floor(bytes.length / 2));
    expect(parseSpectoraExport({ bytes: truncated, filename: "t.xlsx", kind: "xlsx" })).toMatchObject({ ok: false, code: "unreadable" });
  });

  it("rejects zip bombs before inflating", () => {
    const bytes = xlsx([HEADERS, ["Roof", "Coverings", "A", "a"]]);
    const view = new DataView(bytes.buffer);
    for (let offset = 0; offset < bytes.length - 4; offset++) {
      if (view.getUint32(offset, true) === 0x02014b50) {
        view.setUint32(offset + 24, 0x7fffffff, true); // claim ~2 GB uncompressed
        break;
      }
    }
    expect(parseSpectoraExport({ bytes, filename: "t.xlsx", kind: "xlsx" })).toMatchObject({ ok: false, code: "too_large_uncompressed" });
  });
});
