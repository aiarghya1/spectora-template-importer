import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { fakeSupabase, isOp, type Resolver } from "@/test/fake-supabase";
import { getImportReport, getSectionContent, getTemplate, latestTemplateId, listTemplates, renderCommentHtml } from "../queries";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const T = "3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const T2 = "8e7f6a5b-9c0d-4e1f-8a2b-5c6d7e8f9a0b";
const S = "4a3b2c1d-5e6f-4a7b-9c8d-1e2f3a4b5c6d";
const I = "5b4c3d2e-6f7a-4b8c-8d9e-2f3a4b5c6d7e";
const IMP = "9f8a7b6c-0d1e-4f2a-9b3c-6d7e8f9a0b1c";

function withDb(resolve: Resolver) {
  const db = fakeSupabase(resolve);
  vi.mocked(createClient).mockResolvedValue(db.client as never);
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listTemplates / latestTemplateId", () => {
  it("maps embedded counts and newest first", async () => {
    const db = withDb(() => ({
      data: [
        { id: T, name: "InterNACHI", updated_at: "2026-09-14T10:00:00Z", copied_from_id: null, sections: [{ count: 12 }], comments: [{ count: 340 }] },
        { id: T2, name: "Copy", updated_at: "2026-09-13T10:00:00Z", copied_from_id: T, sections: [], comments: null },
      ],
    }));
    expect(await listTemplates()).toEqual([
      { id: T, name: "InterNACHI", updatedAt: "2026-09-14T10:00:00Z", copiedFromId: null, sectionCount: 12, commentCount: 340 },
      { id: T2, name: "Copy", updatedAt: "2026-09-13T10:00:00Z", copiedFromId: T, sectionCount: 0, commentCount: 0 },
    ]);
    expect(db.ops[0].order).toEqual([["updated_at", { ascending: false }]]);
  });

  it("surfaces database errors instead of showing an empty list", async () => {
    withDb(() => ({ error: { message: "connection refused" } }));
    await expect(listTemplates()).rejects.toMatchObject({ message: "connection refused" });
  });

  it("returns the most recent template id, or null", async () => {
    withDb(() => ({ data: [{ id: T }] }));
    expect(await latestTemplateId()).toBe(T);
    withDb(() => ({ data: [] }));
    expect(await latestTemplateId()).toBeNull();
  });
});

describe("getTemplate", () => {
  it("returns null for malformed ids without querying", async () => {
    expect(await getTemplate("../../etc")).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns null when the template isn't visible", async () => {
    withDb(() => ({ data: null }));
    expect(await getTemplate(T)).toBeNull();
  });

  it("loads sections in order with item counts and the source template", async () => {
    const db = withDb((op) => {
      if (isOp(op, "templates", "select") && op.filters.some((f) => f[2] === T)) {
        return { data: { id: T, name: "Copy", version: 3, updated_at: "2026-09-14T10:00:00Z", import_id: IMP, copied_from_id: T2 } };
      }
      if (isOp(op, "templates", "select")) return { data: { id: T2, name: "Original" } };
      if (isOp(op, "sections", "select")) return { data: [{ id: S, name: "Roof", version: 1, items: [{ count: 4 }] }] };
      return {};
    });
    expect(await getTemplate(T)).toEqual({
      id: T,
      name: "Copy",
      version: 3,
      updatedAt: "2026-09-14T10:00:00Z",
      importId: IMP,
      copiedFrom: { id: T2, name: "Original" },
      sections: [{ id: S, name: "Roof", version: 1, itemCount: 4 }],
    });
    expect(db.ops.find((op) => op.name === "sections")?.order).toEqual([["position", undefined]]);
  });

  it("loads every section when a template has more than 1000", async () => {
    const sections = Array.from({ length: 1001 }, (_, n) => ({ id: `section-${n}`, name: `Section ${n}`, version: 1, items: [{ count: 0 }] }));
    const db = withDb((op) => {
      if (op.name === "templates") return { data: { id: T, name: "Large", version: 1, updated_at: "2026-09-14", import_id: null, copied_from_id: null } };
      const [from, to] = op.range ?? [0, 999];
      return { data: sections.slice(from, to + 1) };
    });
    const result = await getTemplate(T);
    expect(result?.sections).toHaveLength(1001);
    expect(result?.sections[1000].name).toBe("Section 1000");
    expect(db.ops.filter((op) => op.name === "sections").map((op) => op.range)).toEqual([[0, 999], [1000, 1999]]);
  });
});

describe("getSectionContent", () => {
  it("scopes by template and section, orders items and comments, and renders safely", async () => {
    const db = withDb((op) => op.name === "items"
      ? { data: [{ id: I, name: "Coverings", version: 1, source_row: 4 }] }
      : { data: [
        { id: "c2", item_id: I, title: "HTML", body_html: '<p>Worn</p><img src=x onerror="alert(1)">', comment_type: "defect", version: 2, source_row: 5, extras: { Category: "1" }, position: 1 },
        { id: "c1", item_id: I, title: "Plain", body_html: "Line one\nLine two", comment_type: null, version: 1, source_row: 4, extras: {}, position: 0 },
      ] });

    const items = await getSectionContent(T, S);
    expect(db.ops[0].filters).toEqual([
      ["eq", "template_id", T],
      ["eq", "section_id", S],
    ]);
    expect(db.ops[0].order).toEqual([["position", undefined]]);
    expect(db.ops[1].filters).toEqual([
      ["eq", "template_id", T],
      ["eq", "items.section_id", S],
    ]);
    expect(items?.[0].comments.map((c) => c.renderedHtml)).toEqual(["Line one<br>Line two", "<p>Worn</p>"]);
    expect(items?.[0].comments[1]).toMatchObject({ commentType: "defect", extras: { Category: "1" }, sourceRow: 5 });
  });

  it("rejects malformed ids", async () => {
    expect(await getSectionContent(T, "nope")).toBeNull();
  });

  it("pages all items and comments past the 1000-row response cap", async () => {
    const items = Array.from({ length: 1002 }, (_, n) => ({ id: `item-${n}`, name: `Item ${n}`, version: 1, source_row: n + 2 }));
    const comments = Array.from({ length: 1003 }, (_, n) => ({
      id: `comment-${String(n).padStart(4, "0")}`, item_id: `item-${n % 1002}`, title: `Comment ${n}`,
      body_html: "safe", comment_type: null, version: 1, source_row: n + 2, extras: {}, position: n === 1002 ? 1 : 0,
    }));
    const db = withDb((op) => {
      const [from, to] = op.range ?? [0, 999];
      return { data: (op.name === "items" ? items : comments).slice(from, to + 1) };
    });
    const result = await getSectionContent(T, S);
    expect(result).toHaveLength(1002);
    expect(result?.[0].comments.map((comment) => comment.title)).toEqual(["Comment 0", "Comment 1002"]);
    expect(result?.[1001].comments[0].title).toBe("Comment 1001");
    expect(db.ops.filter((op) => op.name === "items").map((op) => op.range)).toEqual([[0, 999], [1000, 1999]]);
    expect(db.ops.filter((op) => op.name === "comments").map((op) => op.range)).toEqual([[0, 999], [1000, 1999]]);
  });
});

describe("renderCommentHtml", () => {
  it("adds safe link attributes and strips anything unsafe", () => {
    expect(renderCommentHtml('<a href="https://x.co">x</a>')).toBe('<a href="https://x.co" target="_blank" rel="noopener noreferrer nofollow">x</a>');
    expect(renderCommentHtml("<p onclick=\"x()\">a</p>\n<p>b</p>")).toBe("<p>a</p>\n<p>b</p>");
  });
});

describe("getImportReport", () => {
  function reportDb(issueCount: number, importTemplate: { id: string; name: string } | null) {
    const issues = Array.from({ length: issueCount }, (_, i) => ({
      id: i + 1,
      source_row: i === 0 ? null : i + 1,
      severity: "info",
      category: "structure",
      code: "x",
      message: `issue ${i}`,
      detail: {},
    }));
    return withDb((op) => {
      if (isOp(op, "templates", "select")) return { data: { import_id: IMP } };
      if (isOp(op, "imports", "select")) {
        return {
          data: { id: IMP, filename: "export.xlsx", file_sha256: "a".repeat(64), created_at: "2026-09-14T10:00:00Z", source_rows: 10, summary: { sheetName: "Template" }, template: importTemplate },
        };
      }
      if (isOp(op, "import_issues", "select")) {
        const [from, to] = op.range ?? [0, 0];
        return { data: issues.slice(from, to + 1) };
      }
      if (isOp(op, "comments", "select")) return { data: [{ source_row: 2, item_id: I, items: { section_id: S } }] };
      return {};
    });
  }

  it("pages past Supabase's 1000-row limit and links issues to comments", async () => {
    const db = reportDb(2500, { id: T, name: "InterNACHI" });
    const report = await getImportReport(T);

    expect(db.ops.filter((op) => op.name === "import_issues").map((op) => op.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(report?.issues).toHaveLength(2500);
    expect(report?.issues[0].location).toBeNull();
    expect(report?.issues[1]).toMatchObject({ source_row: 2, location: { sectionId: S, itemId: I } });
    expect(report?.issues[2].location).toBeNull();
    expect(report?.originalTemplate).toBeNull();
  });

  it("names the original template when viewed from a copy", async () => {
    reportDb(1, { id: T2, name: "Original" });
    expect((await getImportReport(T))?.originalTemplate).toEqual({ id: T2, name: "Original" });
  });

  it("returns null without an import, and rethrows database errors", async () => {
    withDb(() => ({ data: { import_id: null } }));
    expect(await getImportReport(T)).toBeNull();
    expect(await getImportReport("bad")).toBeNull();

    withDb((op) => {
      if (isOp(op, "templates", "select")) return { data: { import_id: IMP } };
      if (isOp(op, "imports", "select")) return { data: { id: IMP, summary: null, template: null } };
      return { error: { message: "timeout" } };
    });
    await expect(getImportReport(T)).rejects.toMatchObject({ message: "timeout" });
  });
});
