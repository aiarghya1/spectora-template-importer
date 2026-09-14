/** Every kind of discrepancy the independent verifier must catch, plus CSV and date inputs. */
import { describe, expect, it } from "vitest";
import { prepareImport } from "../commit";
import type { ParseSuccess } from "../types";
import { verifyPreservation } from "../verify";
import { buildXlsx } from "./workbook";

const HEADERS = ["Section Name", "Item Name", "Comment Name", "Comment Text", "Comment Type", "Category", "Last Modified"];

function parsed(rows: unknown[][]) {
  const bytes = buildXlsx(rows);
  const result = prepareImport("t.xlsx", bytes);
  if (!result.ok) throw new Error(result.message);
  return { bytes, parse: result.parse };
}

const fields = (bytes: Uint8Array, parse: ParseSuccess) => verifyPreservation(bytes, "xlsx", parse).mismatches.map((m) => m.field);

describe("verifyPreservation — inputs", () => {
  it("verifies CSV exports, including ones without a Comment Type column", () => {
    const bytes = new TextEncoder().encode("Section Name,Item Name,Comment Name,Comment Text\nRoof,Coverings,A,a\n");
    const result = prepareImport("t.csv", bytes);
    if (!result.ok) throw new Error(result.message);
    expect(verifyPreservation(bytes, "csv", result.parse)).toMatchObject({ mismatches: [], unaccountedRows: [], commentRowsChecked: 1 });
  });

  it("compares date cells the same way the parser stores them", () => {
    const { bytes, parse } = parsed([HEADERS, ["Roof", "Coverings", "A", "a", "info", "", new Date(Date.UTC(2025, 5, 1, 12))]]);
    expect(verifyPreservation(bytes, "xlsx", parse).mismatches).toEqual([]);
  });
});

describe("verifyPreservation — discrepancies", () => {
  it("catches renamed sections, changed titles and types, lost or invented extras, and section order", () => {
    const { bytes, parse } = parsed([
      HEADERS,
      ["Roof", "Coverings", "A", "a", "info", 1],
      ["Exterior", "Siding", "B", "b"],
    ]);
    const tampered: ParseSuccess = structuredClone(parse);
    const [roof, exterior] = tampered.sections;
    const a = roof.items[0].comments[0];
    const b = exterior.items[0].comments[0];
    roof.name = "Roofs";
    a.title = "A (edited)";
    a.comment_type = null;
    delete a.extras.Category;
    b.comment_type = "defect";
    b.extras.Surprise = "invented";
    tampered.sections = [exterior, roof];

    const found = verifyPreservation(bytes, "xlsx", tampered).mismatches;
    expect(found.map((m) => m.field)).toEqual(expect.arrayContaining(["section", "title", "type", "Category", "extras", "section order"]));
    expect(found).toContainEqual({ row: 2, field: "Category", expected: "1", actual: "(missing)" });
    expect(found).toContainEqual({ row: 2, field: "type", expected: "info", actual: "" });
    expect(found).toContainEqual({ row: 3, field: "type", expected: "", actual: "defect" });
  });

  it("catches missing sections and items for rows without comments", () => {
    const { bytes, parse } = parsed([HEADERS, ["Roof", "Coverings", "A", "a"], ["Roof", "Flashing"], ["Garage"]]);
    const tampered: ParseSuccess = structuredClone(parse);
    tampered.sections[0].items = tampered.sections[0].items.filter((i) => i.name !== "Flashing");
    tampered.sections = tampered.sections.filter((s) => s.name !== "Garage");

    const found = verifyPreservation(bytes, "xlsx", tampered).mismatches;
    expect(found).toContainEqual({ row: 3, field: "item", expected: "Flashing", actual: "(missing)" });
    expect(found).toContainEqual({ row: 4, field: "section", expected: "Garage", actual: "(missing)" });
    expect(fields(bytes, parse)).toEqual([]);
  });

  it("rejects invented sections, items, and comments with no source rows", () => {
    const { bytes, parse } = parsed([HEADERS, ["Roof", "Coverings", "A", "a"]]);
    const tampered: ParseSuccess = structuredClone(parse);
    tampered.sections.push({
      name: "Invented section", source_row: 99, extras: {}, items: [{
        name: "Invented item", source_row: 100, extras: {}, comments: [
          { title: "Invented comment", body_html: "x", comment_type: null, source_row: 101, extras: {} },
        ],
      }],
    });
    expect(fields(bytes, tampered)).toEqual(expect.arrayContaining(["extra section", "extra item", "extra comment"]));
  });

  it("rejects duplicated source rows even when names and text match", () => {
    const { bytes, parse } = parsed([HEADERS, ["Roof", "Coverings", "A", "a"]]);
    const tampered: ParseSuccess = structuredClone(parse);
    tampered.sections.push(structuredClone(tampered.sections[0]));
    expect(fields(bytes, tampered)).toEqual(expect.arrayContaining([
      "section source row", "item source row", "comment source row",
    ]));
  });

  it("stops listing mismatches after 200", () => {
    const rows = Array.from({ length: 250 }, (_, i) => ["Roof", "Coverings", `Comment ${i}`, "text"]);
    const { bytes, parse } = parsed([HEADERS, ...rows]);
    const tampered: ParseSuccess = structuredClone(parse);
    for (const comment of tampered.sections[0].items[0].comments) comment.title += " (edited)";
    expect(verifyPreservation(bytes, "xlsx", tampered).mismatches).toHaveLength(200);
  });

  it("flags a row the parser neither imported nor reported", () => {
    const { bytes, parse } = parsed([HEADERS, ["Roof", "Coverings", "A", "a"], ["Exterior", "", "No item here", "text"]]);
    expect(parse.issues.some((i) => i.code === "missing_item")).toBe(true);
    const tampered: ParseSuccess = { ...parse, issues: parse.issues.filter((i) => i.code !== "missing_item") };
    expect(verifyPreservation(bytes, "xlsx", tampered).unaccountedRows).toEqual([3]);
  });
});
