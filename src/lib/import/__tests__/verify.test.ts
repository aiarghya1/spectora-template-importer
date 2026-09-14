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
  ["Roof", "Coverings", "Later row, same names", "separate run", "info", "", 3], // 10: repeated section name
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
    tampered.sections[3].items[0].comments.pop();
    expect(verifyPreservation(bytes, "xlsx", tampered).unaccountedRows).toEqual([10]);
  });

  it("catches changed text, a reordered comment and a rewritten extra field", () => {
    const { bytes, parse } = prepared();
    const tampered = clone(parse);
    const coverings = tampered.sections[0].items[0].comments;
    coverings[0].body_html = "<p>Covering is <b>metal</b>.</p>";
    coverings[1].extras.Category = "0";
    [coverings[0], coverings[1]] = [coverings[1], coverings[0]];
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

  it("checks repeated-name runs and detects an item moved out of order", () => {
    const bytes = buildXlsx([
      SPECTORA_HEADERS,
      ["Roof", "Coverings", "A", "a"],
      ["Roof", "Flashing", "B", "b"],
      ["Roof", "Coverings", "C", "c"],
      ["Exterior", "Siding", "D", "d"],
      ["Roof", "Coverings", "E", "e"],
    ]);
    const result = prepareImport("repeated.xlsx", bytes);
    if (!result.ok) throw new Error(result.message);
    expect(verifyPreservation(bytes, "xlsx", result.parse)).toMatchObject({ mismatches: [], unaccountedRows: [] });
    expect(result.parse.sections.map((s) => s.source_row)).toEqual([2, 5, 6]);
    expect(result.parse.sections[0].items.map((i) => i.source_row)).toEqual([2, 3, 4]);

    const reordered = clone(result.parse);
    [reordered.sections[0].items[1], reordered.sections[0].items[2]] =
      [reordered.sections[0].items[2], reordered.sections[0].items[1]];
    expect(verifyPreservation(bytes, "xlsx", reordered).mismatches.map((m) => m.field)).toContain("item order");

    const merged = clone(result.parse);
    merged.sections[0].items[0].comments.push(...merged.sections[0].items[2].comments);
    merged.sections[0].items.splice(2, 1);
    expect(verifyPreservation(bytes, "xlsx", merged).mismatches.map((m) => m.field)).toContain("item");

    const mergedSection = clone(result.parse);
    mergedSection.sections[0].items[0].comments.push(...mergedSection.sections[2].items[0].comments);
    mergedSection.sections.splice(2, 1);
    expect(verifyPreservation(bytes, "xlsx", mergedSection).mismatches.map((m) => m.field)).toContain("section");
  });

  it("detects adjacent same-name declarations merged into earlier groups", () => {
    const bytes = buildXlsx([
      SPECTORA_HEADERS,
      ["Roof", "Coverings", "A", "a"],
      ["Roof"],
      ["Roof", "Coverings", "B", "b"],
      ["Roof", "Coverings"],
      ["Roof", "Coverings", "C", "c"],
    ]);
    const result = prepareImport("repeated-markers.xlsx", bytes);
    if (!result.ok) throw new Error(result.message);
    expect(verifyPreservation(bytes, "xlsx", result.parse)).toMatchObject({ mismatches: [], unaccountedRows: [] });

    const mergedSection = clone(result.parse);
    mergedSection.sections[0].items.push(...mergedSection.sections[1].items);
    mergedSection.sections.splice(1, 1);
    expect(verifyPreservation(bytes, "xlsx", mergedSection).mismatches.map((m) => m.field)).toContain("section");

    const mergedItem = clone(result.parse);
    mergedItem.sections[1].items[0].comments.push(...mergedItem.sections[1].items[1].comments);
    mergedItem.sections[1].items.splice(1, 1);
    expect(verifyPreservation(bytes, "xlsx", mergedItem).mismatches.map((m) => m.field)).toContain("item");
  });
});
