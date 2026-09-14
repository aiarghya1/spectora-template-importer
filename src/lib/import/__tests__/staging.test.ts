import { describe, expect, it } from "vitest";
import { resumableEndpoint, stagedPath, validStagedPath } from "../staging";

const USER = "11111111-1111-4111-8111-111111111111";
const NONCE = "22222222-2222-4222-8222-222222222222";

describe("private import staging", () => {
  it("accepts only the caller's single-file path and matching extension", () => {
    const path = stagedPath(USER, "InterNACHI Residential.XLSX", NONCE);
    expect(path).toBe(`${USER}/${NONCE}.xlsx`);
    expect(validStagedPath(path, USER, "InterNACHI Residential.xlsx")).toBe(true);
    expect(validStagedPath(path, "33333333-3333-4333-8333-333333333333", "InterNACHI Residential.xlsx")).toBe(false);
    expect(validStagedPath(`${USER}/../${NONCE}.xlsx`, USER, "InterNACHI Residential.xlsx")).toBe(false);
    expect(validStagedPath(path, USER, "template.csv")).toBe(false);
    expect(validStagedPath(path, USER, "../template.xlsx")).toBe(false);
    expect(() => stagedPath(USER, "template.txt", NONCE)).toThrow();
  });

  it("uses the direct Storage host for hosted projects and preserves custom hosts", () => {
    expect(resumableEndpoint("https://abc.supabase.co")).toBe("https://abc.storage.supabase.co/storage/v1/upload/resumable");
    expect(resumableEndpoint("https://storage.example.com/base?x=1")).toBe("https://storage.example.com/storage/v1/upload/resumable");
  });
});
