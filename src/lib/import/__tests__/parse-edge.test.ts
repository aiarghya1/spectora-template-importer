/** Parser paths that only happen with unusual files: library failures, caps, dates, wide rows. */
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { LIMITS, parseSpectoraExport, templateNameFromFilename } from "../parse";
import type { ParseResult, ParseSuccess } from "../types";
import { buildXlsx, SPECTORA_HEADERS } from "./workbook";

vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return { ...actual, read: vi.fn(actual.read) };
});

const csv = (text: string) => parseSpectoraExport({ bytes: new TextEncoder().encode(text), filename: "t.csv", kind: "csv" });
const xlsx = (rows: unknown[][]) => parseSpectoraExport({ bytes: buildXlsx(rows), filename: "t.xlsx", kind: "xlsx" });

function ok(result: ParseResult): ParseSuccess {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  const { nonEmptyCells, cellsStored, cellsInExtras, cellsReported } = result.stats;
  expect(cellsStored + cellsInExtras + cellsReported).toBe(nonEmptyCells);
  return result;
}

describe("spreadsheet library failures", () => {
  it("explains password-protected files and anything else the library can't read", () => {
    vi.mocked(XLSX.read)
      .mockImplementationOnce(() => {
        throw new Error("File is password-protected");
      })
      .mockImplementationOnce(() => {
        throw new Error("Unsupported file 42");
      })
      .mockImplementationOnce(() => {
        throw "not an Error object";
      });
    expect(csv("a,b")).toMatchObject({ ok: false, code: "password_protected" });
    expect(csv("a,b")).toMatchObject({ ok: false, code: "unreadable" });
    expect(csv("a,b")).toMatchObject({ ok: false, code: "unreadable" });
  });

  it("rejects workbooks with no sheets or an empty first sheet", () => {
    vi.mocked(XLSX.read)
      .mockReturnValueOnce({ SheetNames: [], Sheets: {} } as XLSX.WorkBook)
      .mockReturnValueOnce({ SheetNames: ["Blank"], Sheets: { Blank: {} } } as XLSX.WorkBook);
    expect(csv("a")).toMatchObject({ ok: false, code: "no_sheets" });
    expect(csv("a")).toEqual({ ok: false, code: "empty_sheet", message: 'The first sheet ("Blank") is empty.' });
  });

  it("ignores extra sheets that are empty", async () => {
    const actual = await vi.importActual<typeof import("xlsx")>("xlsx");
    vi.mocked(XLSX.read).mockImplementationOnce((data, options) => {
      const workbook = actual.read(data, options);
      workbook.SheetNames.push("Empty");
      workbook.Sheets.Empty = {};
      return workbook;
    });
    const result = ok(xlsx([SPECTORA_HEADERS, ["Roof", "Coverings", "A", "a"]]));
    expect(result.issues.map((i) => i.code)).not.toContain("extra_sheet_ignored");
  });
});

describe("unusual content", () => {
  it("stores date cells as ISO timestamps", () => {
    const result = ok(xlsx([[...SPECTORA_HEADERS, "Last Modified"], ["Roof", "Coverings", "A", "a", "", "", "", new Date(Date.UTC(2024, 0, 15, 12))]]));
    expect(result.sections[0].items[0].comments[0].extras["Last Modified"]).toMatch(/^2024-01-1[45]T/);
  });

  it("keeps values beyond the header row's width as unlabelled columns", () => {
    const result = ok(xlsx([["Section Name", "Item Name", "Comment Name", "Comment Text"], ["Roof", "Coverings", "A", "a", "orphan"]]));
    expect(result.sections[0].items[0].comments[0].extras).toEqual({ "Column E": "orphan" });
    expect(result.columns.at(-1)).toMatchObject({ letter: "E", header: "", role: "extras", values: 1 });
  });

  it("clips very long values in skipped-row details and keys extras by column", () => {
    const result = ok(
      xlsx([
        ["Section Name", "Item Name", "Comment Name", "Comment Text", "Inspector Notes"],
        ["", "Item", "x".repeat(2500), "body", "note"],
        ["Roof", "Coverings", "A", "a", ""],
      ]),
    );
    const skipped = result.issues.find((i) => i.code === "missing_section");
    const values = skipped?.detail.values as Record<string, string>;
    expect(values["Comment Name"]).toBe(`${"x".repeat(LIMITS.detailValue)}… [truncated]`);
    expect(values["Inspector Notes"]).toBe("note");
  });

  it("ignores non-numeric Order values when checking row order", () => {
    const result = ok(
      xlsx([
        SPECTORA_HEADERS,
        ["Roof", "Coverings", "A", "a", "", "", "first"],
        ["Roof", "Coverings", "B", "b", "", "", 2],
        ["Roof", "Coverings", "C", "c", "", "", 1],
      ]),
    );
    expect(result.sections[0].items[0].comments[0].extras["Order (w/i item)"]).toBe("first");
    expect(result.issues.find((i) => i.code === "order_column_differs")?.detail).toMatchObject({ count: 1, rows: [4] });
  });

  it("marks purely cosmetic HTML changes as notes, not warnings", () => {
    const result = ok(xlsx([SPECTORA_HEADERS, ["Roof", "Coverings", "A", "<font>Old style</font>"]]));
    expect(result.issues.find((i) => i.code === "html_sanitized")?.severity).toBe("info");
  });

  it("lists no headers when the sheet has no content at all", () => {
    expect(xlsx([[""]])).toEqual({
      ok: false,
      code: "missing_required_columns",
      message: "Couldn't find the Section Name and Item Name columns. Is this a Spectora template export?",
      detail: { foundHeaders: [] },
    });
  });
});

describe("limits", () => {
  it("rejects templates over the row limit", () => {
    const text = `Section Name,Item Name,Comment Name\n${"Roof,Coverings,A\n".repeat(LIMITS.dataRows + 1)}`;
    expect(csv(text)).toMatchObject({ ok: false, code: "too_many_rows" });
  });

  it("caps listed rows and individual issues, and says how many were left out", () => {
    const rows = ["Roof,Coverings,A,<font>x</font>", ...Array.from({ length: LIMITS.rowIssues }, () => ",,A,<font>x</font>")];
    const result = ok(csv(`Section Name,Item Name,Comment Name,Comment Text\n${rows.join("\n")}\n`));

    const filled = result.issues.find((i) => i.code === "section_filled_down");
    expect(filled?.detail).toMatchObject({ count: LIMITS.rowIssues });
    expect(filled?.detail.rows).toHaveLength(LIMITS.detailRows);
    expect(result.issues.filter((i) => i.code === "html_sanitized")).toHaveLength(LIMITS.rowIssues);
    expect(result.issues.find((i) => i.code === "issues_truncated")).toMatchObject({ detail: { suppressed: 1 } });
  });
});

describe("templateNameFromFilename", () => {
  it("strips paths and extensions, falls back, and caps length", () => {
    expect(templateNameFromFilename("C:\\exports\\InterNACHI.xlsx")).toBe("InterNACHI");
    expect(templateNameFromFilename(".xlsx")).toBe("Imported template");
    expect(templateNameFromFilename(`${"n".repeat(250)}.xlsx`)).toHaveLength(200);
  });
});
