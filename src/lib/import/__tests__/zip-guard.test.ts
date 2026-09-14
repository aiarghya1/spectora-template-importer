import { describe, expect, it } from "vitest";
import { zipDeclaredUncompressedSize } from "../zip-guard";
import { buildXlsx, SPECTORA_HEADERS } from "./workbook";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

function fixture() {
  const bytes = buildXlsx([SPECTORA_HEADERS, ["Roof", "Coverings", "A", "a"]]);
  const view = new DataView(bytes.buffer);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= 0 && eocd < 0; offset--) if (view.getUint32(offset, true) === EOCD) eocd = offset;
  let central = -1;
  for (let offset = 0; offset < bytes.length - 4 && central < 0; offset++) if (view.getUint32(offset, true) === CENTRAL) central = offset;
  return { bytes, view, eocd, central };
}

describe("zipDeclaredUncompressedSize", () => {
  it("sums declared sizes for a real xlsx", () => {
    const size = zipDeclaredUncompressedSize(fixture().bytes);
    expect(size).toBeGreaterThan(1000);
    expect(Number.isFinite(size)).toBe(true);
  });

  it("returns null for bytes that aren't a zip", () => {
    expect(zipDeclaredUncompressedSize(new TextEncoder().encode("Section Name,Item Name\n".repeat(10)))).toBeNull();
  });

  it("treats zip64 markers as too large", () => {
    const entries = fixture();
    entries.view.setUint16(entries.eocd + 10, 0xffff, true);
    expect(zipDeclaredUncompressedSize(entries.bytes)).toBe(Infinity);

    const offset = fixture();
    offset.view.setUint32(offset.eocd + 16, 0xffffffff, true);
    expect(zipDeclaredUncompressedSize(offset.bytes)).toBe(Infinity);

    const entrySize = fixture();
    entrySize.view.setUint32(entrySize.central + 24, 0xffffffff, true);
    expect(zipDeclaredUncompressedSize(entrySize.bytes)).toBe(Infinity);
  });

  it("returns null when the central directory is missing or truncated", () => {
    const wrongPlace = fixture();
    wrongPlace.view.setUint32(wrongPlace.eocd + 16, 0, true); // points at a local header, not the directory
    expect(zipDeclaredUncompressedSize(wrongPlace.bytes)).toBeNull();

    const pastEnd = fixture();
    pastEnd.view.setUint32(pastEnd.eocd + 16, pastEnd.bytes.length - 10, true);
    expect(zipDeclaredUncompressedSize(pastEnd.bytes)).toBeNull();
  });
});
