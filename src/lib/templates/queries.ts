import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sanitizeForRender } from "@/lib/html/sanitize";
import type { ImportIssue } from "@/lib/import/types";
import type { ImportReport, ItemView, TemplateDetail, TemplateListRow } from "./types";

/** Supabase caps responses at 1000 rows by default; page through anything that can exceed that. */
const PAGE = 1000;
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

export const isUuid = (value: string) => z.uuid().safeParse(value).success;
const embeddedCount = (embedded: unknown) =>
  Array.isArray(embedded) ? ((embedded[0] as { count?: number } | undefined)?.count ?? 0) : 0;

export async function listTemplates(): Promise<TemplateListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, updated_at, copied_from_id, sections(count), comments(count)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    updatedAt: t.updated_at,
    copiedFromId: t.copied_from_id,
    sectionCount: embeddedCount(t.sections),
    commentCount: embeddedCount(t.comments),
  }));
}

export async function latestTemplateId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("templates").select("id").order("updated_at", { ascending: false }).limit(1);
  return data?.[0]?.id ?? null;
}

/** Cached per request so the page and generateMetadata share one query. */
export const getTemplate = cache(async (id: string): Promise<TemplateDetail | null> => {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const [templateRes, sectionsRes] = await Promise.all([
    supabase.from("templates").select("id, name, version, updated_at, import_id, copied_from_id").eq("id", id).maybeSingle(),
    supabase.from("sections").select("id, name, version, items(count)").eq("template_id", id).order("position").limit(PAGE),
  ]);
  if (templateRes.error) throw templateRes.error;
  if (sectionsRes.error) throw sectionsRes.error;
  const t = templateRes.data;
  if (!t) return null;

  let copiedFrom: TemplateDetail["copiedFrom"] = null;
  if (t.copied_from_id) {
    const { data } = await supabase.from("templates").select("id, name").eq("id", t.copied_from_id).maybeSingle();
    copiedFrom = data ?? null;
  }

  return {
    id: t.id,
    name: t.name,
    version: t.version,
    updatedAt: t.updated_at,
    importId: t.import_id,
    copiedFrom,
    sections: (sectionsRes.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      version: s.version,
      itemCount: embeddedCount(s.items),
    })),
  };
});

const HAS_TAG = /<[a-z][\s\S]*?>/i;
/** Plain-text comments keep their line breaks; HTML comments render through the allowlist. */
export function renderCommentHtml(stored: string): string {
  const safe = sanitizeForRender(stored);
  return HAS_TAG.test(stored) ? safe : safe.replace(/\n/g, "<br>");
}

export async function getSectionContent(templateId: string, sectionId: string): Promise<ItemView[] | null> {
  if (!isUuid(templateId) || !isUuid(sectionId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, name, version, source_row, comments(id, title, body_html, comment_type, version, source_row, extras, position)")
    .eq("template_id", templateId)
    .eq("section_id", sectionId)
    .order("position")
    .order("position", { referencedTable: "comments" })
    .limit(PAGE);
  if (error) throw error;

  return (data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    version: item.version,
    sourceRow: item.source_row,
    comments: ((item.comments ?? []) as Array<Record<string, unknown>>).map((c) => ({
      id: c.id as string,
      title: c.title as string,
      bodyHtml: c.body_html as string,
      renderedHtml: renderCommentHtml(c.body_html as string),
      commentType: (c.comment_type as string | null) ?? null,
      version: c.version as number,
      sourceRow: (c.source_row as number | null) ?? null,
      extras: (c.extras as Record<string, string>) ?? {},
    })),
  }));
}

export async function getImportReport(templateId: string): Promise<ImportReport | null> {
  if (!isUuid(templateId)) return null;
  const supabase = await createClient();
  const { data: template } = await supabase.from("templates").select("import_id").eq("id", templateId).maybeSingle();
  if (!template?.import_id) return null;

  const { data: imp, error } = await supabase
    .from("imports")
    .select("id, filename, file_sha256, created_at, source_rows, summary, template:templates!imports_template_id_fkey(id, name)")
    .eq("id", template.import_id)
    .maybeSingle();
  if (error) throw error;
  if (!imp) return null;

  const [issues, commentRows] = await Promise.all([
    fetchAll<ImportIssue & { id: number }>((from, to) =>
      supabase
        .from("import_issues")
        .select("id, source_row, severity, category, code, message, detail")
        .eq("import_id", imp.id)
        .order("source_row", { ascending: true, nullsFirst: true })
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ source_row: number | null; item_id: string; items: { section_id: string } | null }>((from, to) =>
      supabase
        .from("comments")
        .select("source_row, item_id, items(section_id)")
        .eq("template_id", templateId)
        .not("source_row", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);

  const locationByRow = new Map<number, { sectionId: string; itemId: string }>();
  for (const c of commentRows) {
    if (c.source_row !== null && c.items) locationByRow.set(c.source_row, { sectionId: c.items.section_id, itemId: c.item_id });
  }

  const original = imp.template as unknown as { id: string; name: string } | null;
  return {
    id: imp.id,
    filename: imp.filename,
    sha256: imp.file_sha256,
    createdAt: imp.created_at,
    sourceRows: imp.source_rows,
    summary: (imp.summary ?? {}) as ImportReport["summary"],
    issues: issues.map((issue) => ({
      ...issue,
      location: issue.source_row !== null ? (locationByRow.get(issue.source_row) ?? null) : null,
    })),
    originalTemplate: original && original.id !== templateId ? original : null,
  };
}
