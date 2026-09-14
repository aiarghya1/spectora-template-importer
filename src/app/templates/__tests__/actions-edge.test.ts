/** Failure paths of the editor actions: invalid input, database errors, and "don't refresh on failure". */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fakeSupabase, isOp, type Resolver } from "@/test/fake-supabase";
import { addComment, addItem, addSection, deleteNode, deleteTemplate, moveNode, renameNode, renameTemplate, updateComment } from "../actions";

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

function withDb(resolve: Resolver) {
  const db = fakeSupabase(resolve);
  vi.mocked(createClient).mockResolvedValue(db.client as never);
  return db;
}

const conflict: Resolver = (op) => (op.action === "update" ? { data: [] } : { data: { id: "exists" } });
const failure = { error: { code: "XX000", message: "boom" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("invalid input never reaches the database", () => {
  it.each([
    ["addSection", () => addSection({ templateId: T, name: "" })],
    ["addItem", () => addItem({ sectionId: "nope", name: "Gutters" })],
    ["addComment", () => addComment({ itemId: I, title: "x".repeat(1001) })],
  ])("%s", async (_name, call) => {
    expect(await call()).toMatchObject({ ok: false, code: "invalid" });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("database errors", () => {
  it.each([
    ["deleteNode", () => deleteNode({ kind: "item", id: I })],
    ["moveNode", () => moveNode({ kind: "comment", id: C, direction: 1 })],
    ["deleteTemplate", () => deleteTemplate({ id: T })],
  ])("%s reports a generic failure", async (_name, call) => {
    withDb(() => failure);
    expect(await call()).toEqual({ ok: false, code: "failed", message: "Couldn't save. Please try again." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("no refresh or template touch when nothing changed", () => {
  it("renames that conflict", async () => {
    const db = withDb(conflict);
    expect(await renameTemplate({ id: T, version: 1, name: "New" })).toMatchObject({ code: "conflict" });
    expect(await renameNode({ kind: "section", id: S, version: 1, name: "New" })).toMatchObject({ code: "conflict" });
    expect(await updateComment({ id: C, version: 1, title: "t", bodyHtml: "b" })).toMatchObject({ code: "conflict" });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(db.ops.filter((op) => isOp(op, "templates", "update"))).toHaveLength(1); // only the rename attempt itself
  });

  it("adds that fail", async () => {
    const db = withDb((op) => (op.action === "insert" ? failure : { data: [] }));
    expect(await addSection({ templateId: T, name: "Garage" })).toMatchObject({ ok: false });
    expect(db.ops.some((op) => isOp(op, "templates", "update"))).toBe(false);

    withDb((op) => {
      if (isOp(op, "sections", "select") && op.single) return { data: { template_id: T } };
      if (isOp(op, "items", "select") && op.single) return { data: { template_id: T } };
      if (op.action === "insert") return failure;
      return { data: [] };
    });
    expect(await addItem({ sectionId: S, name: "Gutters" })).toMatchObject({ ok: false });
    expect(await addComment({ itemId: I, title: "New" })).toMatchObject({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("a move whose row disappeared straight afterwards", async () => {
    withDb(() => ({ data: null }));
    expect(await moveNode({ kind: "section", id: S, direction: -1 })).toEqual({ ok: true });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
