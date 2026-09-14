import { describe, expect, it } from "vitest";
import { buildImportArgs, prepareImport, safeFilename } from "../commit";
import { buildXlsx, SPECTORA_HEADERS } from "./workbook";

describe("safeFilename", () => {
  it("keeps ordinary filename characters", () => {
    expect(safeFilename("InterNACHI Residential - v2 (final) #3 & more.xlsx")).toBe(
      "InterNACHI Residential - v2 (final) #3 & more.xlsx",
    );
    expect(safeFilename("Plantilla de inspección 🏠.xlsx")).toBe("Plantilla de inspección 🏠.xlsx");
  });

  it("strips directories and control characters", () => {
    expect(safeFilename("C:\\Users\\me\\export.xlsx")).toBe("export.xlsx");
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    const bell = String.fromCharCode(7);
    const del = String.fromCharCode(127);
    expect(safeFilename(`bad${bell}name${del}.xlsx`)).toBe("badname.xlsx");
  });

  it("falls back when nothing printable is left, and caps length", () => {
    expect(safeFilename(String.fromCharCode(0, 1, 2))).toBe("upload");
    expect(safeFilename(`${"a".repeat(300)}.xlsx`)).toHaveLength(255);
  });
});

describe("prepareImport", () => {
  it("returns file-stage failures before parsing", () => {
    expect(prepareImport("notes.txt", new TextEncoder().encode("hi"))).toMatchObject({ ok: false, stage: "file", code: "plain_text_export" });
  });

  it("returns parse-stage failures with detail", () => {
    const bytes = buildXlsx([["Name"], ["x"]]);
    expect(prepareImport("t.xlsx", bytes)).toMatchObject({ ok: false, stage: "parse", code: "missing_required_columns" });
  });

  it("fingerprints the bytes and builds the RPC payload", () => {
    const bytes = buildXlsx([SPECTORA_HEADERS, ["Roof", "Coverings", "A", "a"]]);
    const prepared = prepareImport("My Template.xlsx", bytes);
    if (!prepared.ok) throw new Error(prepared.message);
    expect(prepared.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(prepareImport("My Template.xlsx", bytes)).toMatchObject({ sha256: prepared.sha256 });

    const args = buildImportArgs(prepared, "Renamed");
    expect(args).toMatchObject({ p_name: "Renamed", p_filename: "My Template.xlsx", p_file_sha256: prepared.sha256 });
    expect(args.p_sections).toBe(prepared.parse.sections);
    expect(args.p_issues).toBe(prepared.parse.issues);
  });
});
