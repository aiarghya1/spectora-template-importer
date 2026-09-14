import { describe, expect, it } from "vitest";
import { prepareImport } from "../commit";
import type { ParseSuccess } from "../types";
import { verifyPreservation } from "../verify";
import { buildXlsx, SPECTORA_HEADERS } from "./workbook";

// Spreadsheet row numbers in comments.
const ROWS = [
  ["InterNACHI Residential (exported)"], // 1: above header → reported
  SPECTORA_HEADERS, // 2
  ["", "Orphan", "No section above", "text"], // 3: no section yet → skipped
  ["Roof", "Coverings", "Asphalt", '<p>Covering is <b>asphalt</b>. <a href="https://nachi.org">Guide</a></p>', "info", "", 1], // 4
  ["", "", "Missing", 'Missing shingles<script>alert(1)</script><img src="x.jpg">', "defect", 1, 2], // 5: fill-down
  ["Roof", "Flashing"], // 6: item-only
  ["Garage"], // 7: section-only
  ["Exterior", "Siding", "Vinyl 🏠", "Line one\nLine two & more", "limit", -1, 1], // 8
  [], // 9: blank
  ["Roof", "Coverings", "Later row, same item", "grouped", "info", "", 3], // 10: non-contiguous
];

function prepared() {
  const bytes = buildXlsx(ROWS);
  const result = prepareImport("InterNACHI.xlsx", bytes);
  if (!result.ok) throw new Error(result.message);
  return { bytes, parse: result.parse };
}

const clone = (parse: ParseSuccess): ParseSuccess => structuredClone(parse);

describe("verifyPreservation", () => {
  it("confirms a real parse preserved every row", () => {
    const { bytes, parse } = prepared();
    const report = verifyPreservation(bytes, "xlsx", parse);
    expect(report.mismatches).toEqual([]);
    expect(report.unaccountedRows).toEqual([]);
    expect(report).toMatchObject({ dataRows: 7, commentRowsChecked: 4, structureRowsChecked: 2, reportedRows: 1 });
  });

  it("catches a dropped comment", () => {
    const { bytes, parse } = prepared();
    const tampered = clone(parse);
    tampered.sections[0].items[0].comments.pop();
    expect(verifyPreservation(bytes, "xlsx", tampered).unaccountedRows).toEqual([10]);
  });

  it("catches changed text, a reordered comment and a rewritten extra field", () => {
    const { bytes, parse } = prepared();
    const tampered = clone(parse);
    const coverings = tampered.sections[0].items[0].comments;
    coverings[0].body_html = "<p>Covering is <b>metal</b>.</p>";
    coverings[1].extras.Category = "0";
    [coverings[1], coverings[2]] = [coverings[2], coverings[1]];
    const fields = verifyPreservation(bytes, "xlsx", tampered).mismatches.map((m) => m.field);
    expect(fields).toEqual(expect.arrayContaining(["text", "Category", "order"]));
  });

  it("catches a comment placed under the wrong item", () => {
    const { bytes, parse } = prepared();
    const tampered = clone(parse);
    const moved = tampered.sections[0].items[0].comments.shift()!;
    tampered.sections[0].items[1].comments.push(moved);
    expect(verifyPreservation(bytes, "xlsx", tampered).mismatches).toContainEqual(
      expect.objectContaining({ row: 4, field: "item", expected: "Coverings", actual: "Flashing" }),
    );
  });
});
