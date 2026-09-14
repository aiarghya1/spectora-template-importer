/** Empty and failing Supabase responses: queries must degrade to "nothing" or throw, never crash. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { fakeSupabase, isOp, type Resolver } from "@/test/fake-supabase";
import { getImportReport, getSectionContent, getTemplate, listTemplates } from "../queries";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const T = "3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const T2 = "8e7f6a5b-9c0d-4e1f-8a2b-5c6d7e8f9a0b";
const S = "4a3b2c1d-5e6f-4a7b-9c8d-1e2f3a4b5c6d";
const IMP = "9f8a7b6c-0d1e-4f2a-9b3c-6d7e8f9a0b1c";

function withDb(resolve: Resolver) {
  vi.mocked(createClient).mockResolvedValue(fakeSupabase(resolve).client as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("empty responses", () => {
  it("treat missing rows as empty lists", async () => {
    withDb(() => ({}));
    expect(await listTemplates()).toEqual([]);
    expect(await getSectionContent(T, S)).toEqual([]);
  });

  it("show a template whose original has been deleted, with no sections", async () => {
    withDb((op) => {
      if (isOp(op, "templates", "select") && op.filters.some((f) => f[2] === T)) {
        return { data: { id: T, name: "Copy", version: 1, updated_at: "2026-09-14T10:00:00Z", import_id: null, copied_from_id: T2 } };
      }
      return {};
    });
    expect(await getTemplate(T)).toMatchObject({ copiedFrom: null, sections: [] });
  });

  it("fill in defaults for comments with missing fields", async () => {
    withDb((op) => op.name === "items"
      ? { data: [
        { id: "i1", name: "Coverings", version: 1, source_row: null },
        { id: "i2", name: "Flashing", version: 1, source_row: 2 },
      ] }
      : { data: [{ id: "c1", item_id: "i2", title: "t", body_html: "b", version: 1, extras: null, position: 0 }] });
    const items = await getSectionContent(T, S);
    expect(items?.[0].comments).toEqual([]);
    expect(items?.[1].comments[0]).toMatchObject({ commentType: null, sourceRow: null, extras: {} });
  });

  it("build a report from an import with no summary, issues or comments", async () => {
    withDb((op) => {
      if (isOp(op, "templates", "select")) return { data: { import_id: IMP } };
      if (isOp(op, "imports", "select")) {
        return { data: { id: IMP, filename: "f.xlsx", file_sha256: "a".repeat(64), created_at: "2026-09-14T10:00:00Z", source_rows: 0, summary: null, template: null } };
      }
      return {};
    });
    expect(await getImportReport(T)).toMatchObject({ summary: {}, issues: [], originalTemplate: null });
  });

  it("return null when the import record is gone", async () => {
    withDb((op) => (isOp(op, "templates", "select") ? { data: { import_id: IMP } } : { data: null }));
    expect(await getImportReport(T)).toBeNull();
  });
});

describe("originals and orphaned rows", () => {
  it("doesn't look up a source template for originals", async () => {
    const db = fakeSupabase((op) =>
      isOp(op, "templates", "select")
        ? { data: { id: T, name: "Original", version: 1, updated_at: "2026-09-14T10:00:00Z", import_id: IMP, copied_from_id: null } }
        : { data: [] },
    );
    vi.mocked(createClient).mockResolvedValue(db.client as never);
    expect(await getTemplate(T)).toMatchObject({ copiedFrom: null });
    expect(db.ops.filter((op) => op.name === "templates")).toHaveLength(1);
  });

  it("doesn't link issues to comments whose item can't be read", async () => {
    withDb((op) => {
      if (isOp(op, "templates", "select")) return { data: { import_id: IMP } };
      if (isOp(op, "imports", "select")) {
        return { data: { id: IMP, filename: "f.xlsx", file_sha256: "a".repeat(64), created_at: "2026-09-14T10:00:00Z", source_rows: 3, summary: {}, template: null } };
      }
      if (isOp(op, "import_issues", "select")) {
        return { data: [{ id: 1, source_row: 2, severity: "info", category: "sanitized", code: "html_sanitized", message: "m", detail: {} }] };
      }
      return { data: [{ source_row: 2, item_id: "i1", items: null }, { source_row: null, item_id: "i2", items: { section_id: S } }] };
    });
    expect((await getImportReport(T))?.issues[0].location).toBeNull();
  });
});

describe("database errors are thrown, not hidden", () => {
  it.each([
    ["the template row", "templates"],
    ["its sections", "sections"],
  ])("getTemplate when %s fails", async (_label, table) => {
    withDb((op) => (op.name === table ? { error: { message: `${table} failed` } } : { data: [] }));
    await expect(getTemplate(T)).rejects.toMatchObject({ message: `${table} failed` });
  });

  it("getSectionContent", async () => {
    withDb(() => ({ error: { message: "items failed" } }));
    await expect(getSectionContent(T, S)).rejects.toMatchObject({ message: "items failed" });
  });

  it("getImportReport when the import can't be read", async () => {
    withDb((op) => (isOp(op, "templates", "select") ? { data: { import_id: IMP } } : { error: { message: "imports failed" } }));
    await expect(getImportReport(T)).rejects.toMatchObject({ message: "imports failed" });
  });
});
