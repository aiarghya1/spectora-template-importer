"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { describeChanges, sanitizeForStorage } from "@/lib/html/sanitize";
import { renderCommentHtml } from "@/lib/templates/queries";

/**
 * Editor mutations. Every input is validated here (server actions are public endpoints);
 * authorisation is enforced by RLS. Edits use per-row optimistic concurrency via `version`.
 */

export type ActionError = {
  ok: false;
  code: "invalid" | "conflict" | "not_found" | "limit" | "failed";
  message: string;
};
export type ActionResult<T extends object = object> = ({ ok: true } & T) | ActionError;

type NodeKind = "section" | "item" | "comment";
const TABLE = { template: "templates", section: "sections", item: "items", comment: "comments" } as const;

const id = z.uuid("Invalid id.");
const version = z.number().int().positive();
const name = (max: number) => z.string().trim().min(1, "Name can't be empty.").max(max, `Name is too long (${max} characters max).`);

const invalid = (error: z.ZodError): ActionError => ({ ok: false, code: "invalid", message: error.issues[0].message });

function dbError(error: PostgrestError): ActionError {
  if (error.code === "54000") return { ok: false, code: "limit", message: error.message };
  if (error.code === "23514") return { ok: false, code: "invalid", message: "That value is too long to save." };
  console.error("database error", error);
  return { ok: false, code: "failed", message: "Couldn't save. Please try again." };
}

async function touchTemplate(templateId: string) {
  const supabase = await createClient();
  await supabase.from("templates").update({ updated_at: new Date().toISOString() }).eq("id", templateId);
}

async function updateVersioned(
  table: (typeof TABLE)[keyof typeof TABLE],
  rowId: string,
  expected: number,
  patch: Record<string, unknown>,
): Promise<ActionResult<{ version: number; templateId: string }>> {
  const supabase = await createClient();
  const templateColumn = table === "templates" ? "template_id:id" : "template_id";
  const { data, error } = await supabase
    .from(table)
    .update({ ...patch, version: expected + 1 })
    .eq("id", rowId)
    .eq("version", expected)
    .select(`version, ${templateColumn}`);
  if (error) return dbError(error);

  if (!data || data.length === 0) {
    const { data: exists } = await supabase.from(table).select("id").eq("id", rowId).maybeSingle();
    return exists
      ? { ok: false, code: "conflict", message: "This was changed somewhere else (another tab?). Reload to see the latest version." }
      : { ok: false, code: "not_found", message: "This no longer exists — it may have been deleted." };
  }
  const row = data[0] as unknown as { version: number; template_id: string };
  if (table !== "templates") await touchTemplate(row.template_id);
  return { ok: true, version: row.version, templateId: row.template_id };
}

// ---------------------------------------------------------------------------
// Renames and comment edits
// ---------------------------------------------------------------------------

const renameInput = (max: number) => z.object({ id, version, name: name(max) });

export async function renameTemplate(input: unknown) {
  const parsed = renameInput(200).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await updateVersioned("templates", parsed.data.id, parsed.data.version, {
    name: parsed.data.name,
    updated_at: new Date().toISOString(),
  });
  if (result.ok) revalidatePath("/templates");
  return result;
}

export async function renameNode(input: unknown): Promise<ActionResult<{ version: number }>> {
  const parsed = renameInput(500).extend({ kind: z.enum(["section", "item"]) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { kind, id: rowId, version: v, name: newName } = parsed.data;
  const result = await updateVersioned(TABLE[kind], rowId, v, { name: newName });
  if (result.ok && kind === "section") revalidatePath(`/templates/${result.templateId}`);
  return result;
}

const commentInput = z.object({
  id,
  version,
  title: z.string().max(1000, "Comment name is too long (1,000 characters max)."),
  bodyHtml: z.string().max(200_000, "Comment text is too long."),
});

export async function updateComment(
  input: unknown,
): Promise<ActionResult<{ version: number; bodyHtml: string; renderedHtml: string; notice: string | null }>> {
  const parsed = commentInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { html, changes } = sanitizeForStorage(parsed.data.bodyHtml);
  const result = await updateVersioned("comments", parsed.data.id, parsed.data.version, {
    title: parsed.data.title,
    body_html: html,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    version: result.version,
    bodyHtml: html,
    renderedHtml: renderCommentHtml(html),
    notice: changes.length ? describeChanges(changes) : null,
  };
}

// ---------------------------------------------------------------------------
// Structure: add, delete, move
// ---------------------------------------------------------------------------

async function insertAtEnd(
  table: "sections" | "items" | "comments",
  parentColumn: "template_id" | "section_id" | "item_id",
  parentId: string,
  row: Record<string, unknown>,
) {
  const supabase = await createClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await supabase
      .from(table)
      .select("position")
      .eq(parentColumn, parentId)
      .order("position", { ascending: false })
      .limit(1);
    const position = last?.[0] ? (last[0].position as number) + 1 : 0;
    const { data, error } = await supabase.from(table).insert({ ...row, [parentColumn]: parentId, position }).select("id").single();
    if (!error) return { ok: true as const, id: data.id as string };
    if (error.code !== "23505") return dbError(error); // retry only on a concurrent position clash
  }
  return { ok: false as const, code: "failed" as const, message: "Couldn't add — please try again." };
}

export async function addSection(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({ templateId: id, name: name(500) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await insertAtEnd("sections", "template_id", parsed.data.templateId, { name: parsed.data.name });
  if (result.ok) {
    await touchTemplate(parsed.data.templateId);
    revalidatePath(`/templates/${parsed.data.templateId}`);
  }
  return result;
}

export async function addItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({ sectionId: id, name: name(500) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: section } = await supabase.from("sections").select("template_id").eq("id", parsed.data.sectionId).maybeSingle();
  if (!section) return { ok: false, code: "not_found", message: "That section no longer exists." };
  const result = await insertAtEnd("items", "section_id", parsed.data.sectionId, {
    template_id: section.template_id,
    name: parsed.data.name,
  });
  if (result.ok) {
    await touchTemplate(section.template_id);
    revalidatePath(`/templates/${section.template_id}`);
  }
  return result;
}

export async function addComment(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({ itemId: id, title: name(1000) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: item } = await supabase.from("items").select("template_id").eq("id", parsed.data.itemId).maybeSingle();
  if (!item) return { ok: false, code: "not_found", message: "That item no longer exists." };
  const result = await insertAtEnd("comments", "item_id", parsed.data.itemId, {
    template_id: item.template_id,
    title: parsed.data.title,
    body_html: "",
  });
  if (result.ok) {
    await touchTemplate(item.template_id);
    revalidatePath(`/templates/${item.template_id}`);
  }
  return result;
}

const nodeInput = z.object({ kind: z.enum(["section", "item", "comment"]), id });

export async function deleteNode(input: unknown): Promise<ActionResult> {
  const parsed = nodeInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE[parsed.data.kind as NodeKind]).delete().eq("id", parsed.data.id).select("template_id");
  if (error) return dbError(error);
  if (!data?.length) return { ok: false, code: "not_found", message: "Already deleted." };
  await touchTemplate(data[0].template_id);
  revalidatePath(`/templates/${data[0].template_id}`);
  return { ok: true };
}

export async function moveNode(input: unknown): Promise<ActionResult> {
  const parsed = nodeInput.extend({ direction: z.union([z.literal(-1), z.literal(1)]) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_node", {
    p_kind: parsed.data.kind,
    p_id: parsed.data.id,
    p_direction: parsed.data.direction,
  });
  if (error) return error.code === "P0002" ? { ok: false, code: "not_found", message: "This no longer exists." } : dbError(error);
  const { data } = await supabase.from(TABLE[parsed.data.kind]).select("template_id").eq("id", parsed.data.id).maybeSingle();
  if (data) {
    await touchTemplate(data.template_id);
    revalidatePath(`/templates/${data.template_id}`);
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Whole templates
// ---------------------------------------------------------------------------

export async function duplicateTemplate(input: unknown): Promise<ActionError> {
  const parsed = z.object({ id, name: name(200) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_template", { p_source: parsed.data.id, p_name: parsed.data.name });
  if (error) return error.code === "P0002" ? { ok: false, code: "not_found", message: "Template not found." } : dbError(error);
  revalidatePath("/templates");
  redirect(`/templates/${data as string}?copied=1`);
}

export async function deleteTemplate(input: unknown): Promise<ActionError> {
  const parsed = z.object({ id }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("templates").delete().eq("id", parsed.data.id).select("id");
  if (error) return dbError(error);
  if (!data?.length) return { ok: false, code: "not_found", message: "Template not found." };
  revalidatePath("/templates");
  redirect("/templates");
}
