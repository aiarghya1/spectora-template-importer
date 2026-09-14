import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fakeSupabase, isOp, type Resolver } from "@/test/fake-supabase";
import {
  addComment,
  addItem,
  addSection,
  deleteNode,
  deleteTemplate,
  duplicateTemplate,
  moveNode,
  renameNode,
  renameTemplate,
  updateComment,
} from "../actions";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const T = "3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const S = "4a3b2c1d-5e6f-4a7b-9c8d-1e2f3a4b5c6d";
const I = "5b4c3d2e-6f7a-4b8c-8d9e-2f3a4b5c6d7e";
const C = "6c5d4e3f-7a8b-4c9d-9e0f-3a4b5c6d7e8f";
const NEW = "7d6e5f4a-8b9c-4d0e-8f1a-4b5c6d7e8f9a";

function withDb(resolve: Resolver) {
  const db = fakeSupabase(resolve);
  vi.mocked(createClient).mockResolvedValue(db.client as never);
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("input validation (server actions are public endpoints)", () => {
  it.each([
    [{ kind: "section", id: "not-a-uuid", version: 1, name: "Roof" }, "Invalid id."],
    [{ kind: "section", id: S, version: 1, name: "   " }, "Name can't be empty."],
    [{ kind: "section", id: S, version: 1, name: "x".repeat(501) }, "Name is too long (500 characters max)."],
    [{ kind: "template", id: S, version: 1, name: "Roof" }, undefined],
    [{ kind: "item", id: S, version: 0, name: "Roof" }, undefined],
    ["garbage", undefined],
  ])("rejects %j without touching the database", async (input, message) => {
    const result = await renameNode(input);
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    if (message) expect(result).toMatchObject({ message });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("renameNode", () => {
  it("updates with version check, touches the template and refreshes the page", async () => {
    const db = withDb((op) => (isOp(op, "sections", "update") ? { data: [{ version: 3, template_id: T }] } : {}));
    const result = await renameNode({ kind: "section", id: S, version: 2, name: "  Roof covering  " });

    expect(result).toEqual({ ok: true, version: 3, templateId: T });
    expect(db.ops[0]).toMatchObject({
      name: "sections",
      action: "update",
      payload: { name: "Roof covering", version: 3 },
      columns: "version, template_id",
      filters: [
        ["eq", "id", S],
        ["eq", "version", 2],
      ],
    });
    expect(db.ops[1]).toMatchObject({ name: "templates", action: "update", filters: [["eq", "id", T]] });
    expect(revalidatePath).toHaveBeenCalledWith(`/templates/${T}`);
  });

  it("does not refresh the page for item renames (the client already shows the new name)", async () => {
    withDb((op) => (isOp(op, "items", "update") ? { data: [{ version: 2, template_id: T }] } : {}));
    expect(await renameNode({ kind: "item", id: I, version: 1, name: "Flashing" })).toMatchObject({ ok: true });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a conflict when the row exists at a newer version", async () => {
    withDb((op) => {
      if (isOp(op, "items", "update")) return { data: [] };
      if (isOp(op, "items", "select")) return { data: { id: I } };
      return {};
    });
    expect(await renameNode({ kind: "item", id: I, version: 1, name: "Flashing" })).toMatchObject({ ok: false, code: "conflict" });
  });

  it("reports not found when the row is gone (or belongs to someone else)", async () => {
    withDb((op) => (isOp(op, "items", "update") ? { data: [] } : { data: null }));
    expect(await renameNode({ kind: "item", id: I, version: 1, name: "Flashing" })).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("renameTemplate", () => {
  it("renames with a 200-character limit and refreshes the list", async () => {
    const db = withDb((op) => (isOp(op, "templates", "update") ? { data: [{ version: 8, template_id: T }] } : {}));
    expect(await renameTemplate({ id: T, version: 7, name: "InterNACHI 2026" })).toEqual({ ok: true, version: 8, templateId: T });
    expect(db.ops).toHaveLength(1);
    expect(db.ops[0]).toMatchObject({ columns: "version, template_id:id", payload: { name: "InterNACHI 2026", version: 8 } });
    expect(typeof (db.ops[0].payload as { updated_at: unknown }).updated_at).toBe("string");
    expect(revalidatePath).toHaveBeenCalledWith("/templates");

    expect(await renameTemplate({ id: T, version: 7, name: "x".repeat(201) })).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("updateComment", () => {
  it("sanitises the HTML before saving and tells the user what changed", async () => {
    const db = withDb((op) => (isOp(op, "comments", "update") ? { data: [{ version: 5, template_id: T }] } : {}));
    const result = await updateComment({ id: C, version: 4, title: "Missing shingles", bodyHtml: "<p>Hi</p><script>alert(1)</script>" });

    expect(db.ops[0].payload).toEqual({ title: "Missing shingles", body_html: "<p>Hi</p>", version: 5 });
    expect(result).toMatchObject({ ok: true, version: 5, bodyHtml: "<p>Hi</p>", renderedHtml: "<p>Hi</p>" });
    expect(result.ok && result.notice).toMatch(/script/);
  });

  it("returns no notice for clean HTML and keeps plain-text line breaks", async () => {
    withDb((op) => (isOp(op, "comments", "update") ? { data: [{ version: 2, template_id: T }] } : {}));
    const result = await updateComment({ id: C, version: 1, title: "", bodyHtml: "Line one\nLine two" });
    expect(result).toMatchObject({ ok: true, notice: null, renderedHtml: "Line one<br>Line two" });
  });

  it("rejects over-long text", async () => {
    expect(await updateComment({ id: C, version: 1, title: "x", bodyHtml: "x".repeat(200_001) })).toMatchObject({ ok: false, code: "invalid" });
  });

  it.each([
    ["23514", "invalid", "That value is too long to save."],
    ["54000", "limit", "limit reached"],
    ["XX000", "failed", "Couldn't save. Please try again."],
  ])("maps database error %s to %s", async (code, expected, message) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    withDb((op) => (isOp(op, "comments", "update") ? { error: { code, message: "limit reached" } } : {}));
    expect(await updateComment({ id: C, version: 1, title: "t", bodyHtml: "b" })).toEqual({ ok: false, code: expected, message });
    log.mockRestore();
  });
});

describe("adding", () => {
  it("appends a section after the last position, retrying on a concurrent position clash", async () => {
    let inserts = 0;
    const db = withDb((op) => {
      if (isOp(op, "sections", "select")) return { data: [{ position: 4 + inserts }] };
      if (isOp(op, "sections", "insert")) {
        inserts++;
        return inserts === 1 ? { error: { code: "23505", message: "duplicate" } } : { data: { id: NEW } };
      }
      return {};
    });

    expect(await addSection({ templateId: T, name: "Garage" })).toEqual({ ok: true, id: NEW });
    const positionQuery = db.ops.find((op) => isOp(op, "sections", "select"));
    expect(positionQuery).toMatchObject({ filters: [["eq", "template_id", T]], order: [["position", { ascending: false }]], limit: 1 });
    expect(db.ops.filter((op) => isOp(op, "sections", "insert")).map((op) => op.payload)).toEqual([
      { name: "Garage", template_id: T, position: 5 },
      { name: "Garage", template_id: T, position: 6 },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith(`/templates/${T}`);
  });

  it("gives up after repeated clashes, and fails fast on other errors", async () => {
    const db = withDb((op) => (isOp(op, "sections", "insert") ? { error: { code: "23505", message: "dup" } } : { data: [] }));
    expect(await addSection({ templateId: T, name: "Garage" })).toEqual({ ok: false, code: "failed", message: "Couldn't add — please try again." });
    expect(db.ops.filter((op) => op.action === "insert")).toHaveLength(3);

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const db2 = withDb((op) => (isOp(op, "sections", "insert") ? { error: { code: "42501", message: "rls" } } : { data: [] }));
    expect(await addSection({ templateId: T, name: "Garage" })).toMatchObject({ ok: false, code: "failed" });
    expect(db2.ops.filter((op) => op.action === "insert")).toHaveLength(1);
    log.mockRestore();
  });

  it("adds an item into its section's template, or reports a missing section", async () => {
    const db = withDb((op) => {
      if (isOp(op, "sections", "select")) return { data: { template_id: T } };
      if (isOp(op, "items", "select")) return { data: [] };
      if (isOp(op, "items", "insert")) return { data: { id: NEW } };
      return {};
    });
    expect(await addItem({ sectionId: S, name: "Gutters" })).toEqual({ ok: true, id: NEW });
    expect(db.ops.find((op) => isOp(op, "items", "insert"))?.payload).toEqual({ template_id: T, name: "Gutters", section_id: S, position: 0 });

    withDb(() => ({ data: null }));
    expect(await addItem({ sectionId: S, name: "Gutters" })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("adds an empty comment with a title", async () => {
    const db = withDb((op) => {
      if (isOp(op, "items", "select")) return { data: { template_id: T } };
      if (isOp(op, "comments", "select")) return { data: [{ position: 2 }] };
      if (isOp(op, "comments", "insert")) return { data: { id: NEW } };
      return {};
    });
    expect(await addComment({ itemId: I, title: "New comment" })).toEqual({ ok: true, id: NEW });
    expect(db.ops.find((op) => isOp(op, "comments", "insert"))?.payload).toEqual({
      template_id: T,
      title: "New comment",
      body_html: "",
      item_id: I,
      position: 3,
    });

    withDb(() => ({ data: null }));
    expect(await addComment({ itemId: I, title: "New comment" })).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("deleteNode and moveNode", () => {
  it("deletes and refreshes, or reports it was already gone", async () => {
    const db = withDb((op) => (isOp(op, "comments", "delete") ? { data: [{ template_id: T }] } : {}));
    expect(await deleteNode({ kind: "comment", id: C })).toEqual({ ok: true });
    expect(db.ops[0]).toMatchObject({ filters: [["eq", "id", C]], columns: "template_id" });
    expect(revalidatePath).toHaveBeenCalledWith(`/templates/${T}`);

    withDb(() => ({ data: [] }));
    expect(await deleteNode({ kind: "comment", id: C })).toMatchObject({ ok: false, code: "not_found" });
    expect(await deleteNode({ kind: "template", id: C })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("moves through the move_node function", async () => {
    const db = withDb((op) => (isOp(op, "items", "select") ? { data: { template_id: T } } : {}));
    expect(await moveNode({ kind: "item", id: I, direction: -1 })).toEqual({ ok: true });
    expect(db.ops[0]).toMatchObject({ kind: "rpc", name: "move_node", payload: { p_kind: "item", p_id: I, p_direction: -1 } });
    expect(revalidatePath).toHaveBeenCalledWith(`/templates/${T}`);
  });

  it("validates direction and maps errors", async () => {
    expect(await moveNode({ kind: "item", id: I, direction: 2 })).toMatchObject({ ok: false, code: "invalid" });
    withDb((op) => (op.kind === "rpc" ? { error: { code: "P0002", message: "not found" } } : {}));
    expect(await moveNode({ kind: "item", id: I, direction: 1 })).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("whole templates", () => {
  it("duplicates and redirects to the copy", async () => {
    const db = withDb((op) => (op.kind === "rpc" ? { data: NEW } : {}));
    await expect(duplicateTemplate({ id: T, name: "InterNACHI (copy)" })).rejects.toThrow(`REDIRECT:/templates/${NEW}?copied=1`);
    expect(db.ops[0]).toMatchObject({ name: "duplicate_template", payload: { p_source: T, p_name: "InterNACHI (copy)" } });
    expect(revalidatePath).toHaveBeenCalledWith("/templates");
  });

  it("reports duplicate failures without redirecting", async () => {
    expect(await duplicateTemplate({ id: T, name: "" })).toMatchObject({ ok: false, code: "invalid" });
    withDb(() => ({ error: { code: "P0002", message: "template not found" } }));
    expect(await duplicateTemplate({ id: T, name: "Copy" })).toMatchObject({ ok: false, code: "not_found" });
    withDb(() => ({ error: { code: "54000", message: "template limit reached (200 per account)" } }));
    expect(await duplicateTemplate({ id: T, name: "Copy" })).toEqual({
      ok: false,
      code: "limit",
      message: "template limit reached (200 per account)",
    });
  });

  it("deletes a template and returns to the list, or reports not found", async () => {
    withDb((op) => (isOp(op, "templates", "delete") ? { data: [{ id: T }] } : {}));
    await expect(deleteTemplate({ id: T })).rejects.toThrow("REDIRECT:/templates");

    withDb(() => ({ data: [] }));
    expect(await deleteTemplate({ id: T })).toMatchObject({ ok: false, code: "not_found" });
    expect(await deleteTemplate({ id: "x" })).toMatchObject({ ok: false, code: "invalid" });
  });
});
