import { describe, expect, it } from "vitest";
import { checkUpload, MAX_UPLOAD_BYTES } from "../file-check";

const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]);
const text = (s: string) => new TextEncoder().encode(s);

describe("checkUpload", () => {
  it("accepts real xlsx, xls and csv", () => {
    expect(checkUpload("t.xlsx", zip)).toEqual({ ok: true, kind: "xlsx" });
    expect(checkUpload("t.XLS", ole)).toEqual({ ok: true, kind: "xls" });
    expect(checkUpload("t.csv", text("﻿Section,Item\nRoof,Shingles"))).toEqual({ ok: true, kind: "csv" });
  });

  it("rejects empty and oversized files", () => {
    expect(checkUpload("t.xlsx", new Uint8Array())).toMatchObject({ ok: false, code: "empty_file" });
    expect(checkUpload("t.csv", new Uint8Array(MAX_UPLOAD_BYTES + 1).fill(65))).toMatchObject({
      ok: false,
      code: "too_large",
    });
  });

  it("explains the plain-text export mistake", () => {
    expect(checkUpload("InterNACHI.txt", text("Roof\nShingles"))).toMatchObject({ ok: false, code: "plain_text_export" });
  });

  it("rejects other types", () => {
    expect(checkUpload("t.pdf", text("%PDF"))).toMatchObject({ ok: false, code: "unsupported_type" });
    expect(checkUpload("noext", zip)).toMatchObject({ ok: false, code: "unsupported_type" });
  });

  it("rejects renamed or corrupt files", () => {
    expect(checkUpload("t.xlsx", text("Section,Item"))).toMatchObject({ ok: false, code: "content_mismatch" });
    expect(checkUpload("t.csv", zip)).toMatchObject({ ok: false, code: "content_mismatch" });
    expect(checkUpload("t.csv", new Uint8Array([0xff, 0xfe, 0x00, 0x41]))).toMatchObject({
      ok: false,
      code: "content_mismatch",
    });
  });

  it("rejects invalid UTF-8 in large files but tolerates a character cut at the sample boundary", () => {
    const big = new Uint8Array(100 * 1024).fill(65);
    big[10] = 0xff; // invalid byte inside the sampled region
    expect(checkUpload("t.csv", big)).toMatchObject({ ok: false, code: "content_mismatch" });

    const euro = new TextEncoder().encode("€"); // 3 bytes
    const cut = new Uint8Array(100 * 1024).fill(65);
    cut.set(euro, 64 * 1024 - 1); // straddles the 64 KB sample edge
    expect(checkUpload("t.csv", cut)).toEqual({ ok: true, kind: "csv" });
  });
});
