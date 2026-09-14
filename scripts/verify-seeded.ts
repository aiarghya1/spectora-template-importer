/** Compare every persisted section, item, and comment with a real export as the demo user. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prepareImport } from "../src/lib/import/commit";
import { checkUpload } from "../src/lib/import/file-check";
import { verifyPreservation } from "../src/lib/import/verify";
import { fail, requireEnv, resolveExportPath } from "./lib";

type SectionRow = { id: string; position: number; name: string; source_row: number | null; extras: Record<string, string> };
type ItemRow = SectionRow & { section_id: string };
type CommentRow = {
  id: string; item_id: string; position: number; title: string; body_html: string;
  comment_type: string | null; source_row: number | null; extras: Record<string, string>;
};

const PAGE = 1000;
async function fetchAll<T>(client: SupabaseClient, table: string, templateId: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select("*").eq("template_id", templateId).order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

function equal(path: string, actual: unknown, expected: unknown) {
  try {
    assert.deepStrictEqual(actual, expected);
  } catch {
    fail(`${path} differs from the spreadsheet: expected ${JSON.stringify(expected)?.slice(0, 300)}, stored ${JSON.stringify(actual)?.slice(0, 300)}`);
  }
}

async function main() {
  const path = resolveExportPath(process.argv[2]);
  const bytes = new Uint8Array(readFileSync(path));
  const file = checkUpload(basename(path), bytes);
  if (!file.ok) fail(`${file.code}: ${file.message}`);
  const prepared = prepareImport(basename(path), bytes);
  if (!prepared.ok) fail(`${prepared.code}: ${prepared.message}`);
  const { parse, sha256 } = prepared;
  const source = verifyPreservation(bytes, file.kind, parse);
  if (source.mismatches.length || source.unaccountedRows.length) fail("The export itself failed the row-by-row preservation check.");

  const client = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email: requireEnv("DEMO_EMAIL"), password: requireEnv("DEMO_PASSWORD"),
  });
  if (signInError) throw signInError;

  const { data: imp, error: importError } = await client.from("imports")
    .select("id, template_id").eq("file_sha256", sha256).not("template_id", "is", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (importError) throw importError;
  if (!imp?.template_id) fail(`No imported template matches SHA-256 ${sha256}. Run npm run seed first.`);
  const templateId = imp.template_id as string;

  const [sections, items, comments] = await Promise.all([
    fetchAll<SectionRow>(client, "sections", templateId),
    fetchAll<ItemRow>(client, "items", templateId),
    fetchAll<CommentRow>(client, "comments", templateId),
  ]);
  equal("section count", sections.length, parse.stats.sections);
  equal("item count", items.length, parse.stats.items);
  equal("comment count", comments.length, parse.stats.comments);

  const ordered = <T extends { position: number }>(rows: T[]) => rows.sort((a, b) => a.position - b.position);
  for (const [sectionPosition, expectedSection] of parse.sections.entries()) {
    const section = ordered(sections)[sectionPosition];
    const sectionPath = `section ${sectionPosition + 1} (row ${expectedSection.source_row})`;
    equal(`${sectionPath} position`, section.position, sectionPosition);
    equal(`${sectionPath} name`, section.name, expectedSection.name);
    equal(`${sectionPath} source row`, section.source_row, expectedSection.source_row);
    equal(`${sectionPath} extras`, section.extras, expectedSection.extras);

    const sectionItems = ordered(items.filter((item) => item.section_id === section.id));
    equal(`${sectionPath} item count`, sectionItems.length, expectedSection.items.length);
    for (const [itemPosition, expectedItem] of expectedSection.items.entries()) {
      const item = sectionItems[itemPosition];
      const itemPath = `${sectionPath}, item ${itemPosition + 1} (row ${expectedItem.source_row})`;
      equal(`${itemPath} position`, item.position, itemPosition);
      equal(`${itemPath} name`, item.name, expectedItem.name);
      equal(`${itemPath} source row`, item.source_row, expectedItem.source_row);
      equal(`${itemPath} extras`, item.extras, expectedItem.extras);

      const itemComments = ordered(comments.filter((comment) => comment.item_id === item.id));
      equal(`${itemPath} comment count`, itemComments.length, expectedItem.comments.length);
      for (const [commentPosition, expectedComment] of expectedItem.comments.entries()) {
        const comment = itemComments[commentPosition];
        const commentPath = `${itemPath}, comment ${commentPosition + 1} (row ${expectedComment.source_row})`;
        equal(`${commentPath} position`, comment.position, commentPosition);
        equal(`${commentPath} title`, comment.title, expectedComment.title);
        equal(`${commentPath} HTML`, comment.body_html, expectedComment.body_html);
        equal(`${commentPath} type`, comment.comment_type, expectedComment.comment_type);
        equal(`${commentPath} source row`, comment.source_row, expectedComment.source_row);
        equal(`${commentPath} extras`, comment.extras, expectedComment.extras);
      }
    }
  }
  console.log(`✓ SHA-256 ${sha256}: ${sections.length} sections, ${items.length} items, and ${comments.length} comments match the stored template exactly, including hierarchy and order.`);
  console.log(`Template ${templateId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
