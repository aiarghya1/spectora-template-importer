import { describe, expect, it } from "vitest";
import { previewPayload } from "../preview";
import type { PreparedImport } from "../commit";

type Ready = Extract<PreparedImport, { ok: true }>;
const large = (): Ready => ({
  ok: true, sha256: "a".repeat(64), filename: "large.xlsx",
  parse: {
    ok: true, templateName: "Large", sheetName: "Template",
    columns: [{ letter: "A", header: "H".repeat(300), role: "extras", extrasKey: "K".repeat(300), known: false, note: "N".repeat(300), values: 12 },
      { letter: "B", header: "Other", role: "section", extrasKey: "Other", known: true, note: null, values: 12 }],
    issues: [{ source_row: null, severity: "warning", category: "unsupported", code: "x", message: "M".repeat(700), detail: { original: "D".repeat(2000) } }],
    sections: [{ name: "Roof", source_row: 2, extras: {}, items: [{
      name: "Coverings", source_row: 2, extras: {},
      comments: Array.from({ length: 12 }, (_, index) => ({
        title: `Comment ${index}`, body_html: "x".repeat(190_000), comment_type: null,
        source_row: index + 2, extras: { "Inspector Notes": "E".repeat(300) },
      })),
    }] }],
    stats: { sourceRows: 14, headerRow: 1, dataRows: 12, blankRows: 0, skippedRows: 0,
      itemOnlyRows: 0, sectionOnlyRows: 0, sections: 1, items: 1, comments: 12,
      nonEmptyCells: 48, cellsStored: 48, cellsInExtras: 0, cellsReported: 0 },
  },
});

describe("bounded import preview", () => {
  it("keeps a small result complete", () => {
    const prepared = large();
    prepared.parse.sections[0].items[0].comments = prepared.parse.sections[0].items[0].comments.slice(0, 1);
    const payload = previewPayload(prepared);
    expect(payload.previewSample).toBe(false);
    expect(payload.parse.sections[0].items[0].comments[0].body_html).toHaveLength(190_000);
  });

  it("bounds a large response without changing the stored parse or exact totals", () => {
    const prepared = large();
    const payload = previewPayload(prepared);
    expect(payload.previewSample).toBe(true);
    expect(payload.parse.stats).toBe(prepared.parse.stats);
    expect(payload.parse.sections[0].items[0].comments[0].body_html).toHaveLength(1000);
    expect(payload.parse.sections[0].items[0].comments[0].extras["Inspector Notes"]).toHaveLength(200);
    expect(payload.parse.columns[0].header).toHaveLength(200);
    expect(payload.parse.columns[0].note).toHaveLength(200);
    expect(payload.parse.columns[1].note).toBeNull();
    expect(payload.parse.issues[0].message).toHaveLength(500);
    expect(String(payload.parse.issues[0].detail.preview)).toHaveLength(1000);
    expect(prepared.parse.sections[0].items[0].comments[0].body_html).toHaveLength(190_000);
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(2_000_000);
  });
});
