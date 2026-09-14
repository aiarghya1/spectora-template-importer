/**
 * End-to-end preservation: spreadsheet bytes → parser → import_template RPC → read back from the DB.
 * What comes out of the database must equal what the parser produced, for the template and for a copy.
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { buildImportArgs, prepareImport } from "../../src/lib/import/commit";
import type { ParsedSection } from "../../src/lib/import/types";
import { asUser, createTestDb, createUser, IMPORT_SQL } from "./helpers";

const ROWS = [
  ["Section Name", "Item Name", "Comment Name", "Comment Text", "Comment Type", "Category", "Default Photo 1", "Surprise Column"],
  ["Roof", "Coverings", "Asphalt", "<p>Covering is <b>asphalt</b> — see <a href=\"https://www.nachi.org\">NACHI</a></p>", "info", "", "", ""],
  ["", "", "Missing shingles", "<span style=\"color:red\">Safety:</span> shingles missing<img src=\"https://x/y.jpg\">", "defect", "1", "https://x/photo.jpg", "keep me"],
  ["Roof", "Flashing"],
  ["Exterior", "Siding", "Vinyl 🏠", "Line one\nLine two & more", "limit", "-1", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["Attic", "Insulation", "Low R-value", "", "defect", "0", "", ""],
];

let db: PGlite;
let as: ReturnType<typeof asUser>;
let user: string;

beforeAll(async () => {
  db = await createTestDb();
  as = asUser(db);
  user = await createUser(db);
});

function workbookBytes(): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ROWS), "Template");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

async function readTree(tx: Transaction, templateId: string): Promise<ParsedSection[]> {
  const sections = await tx.query<{ id: string; name: string; source_row: number; extras: Record<string, string> }>(
    `select id, name, source_row, extras from public.sections where template_id = $1 order by position`,
    [templateId],
  );
  const result: ParsedSection[] = [];
  for (const s of sections.rows) {
    const items = await tx.query<{ id: string; name: string; source_row: number; extras: Record<string, string> }>(
      `select id, name, source_row, extras from public.items where section_id = $1 order by position`,
      [s.id],
    );
    const parsedItems = [];
    for (const i of items.rows) {
      const comments = await tx.query<ParsedSection["items"][number]["comments"][number]>(
        `select title, body_html, comment_type, source_row, extras from public.comments where item_id = $1 order by position`,
        [i.id],
      );
      parsedItems.push({ name: i.name, source_row: i.source_row, extras: i.extras, comments: comments.rows });
    }
    result.push({ name: s.name, source_row: s.source_row, extras: s.extras, items: parsedItems });
  }
  return result;
}

describe("import pipeline preservation", () => {
  it("stores exactly what the parser produced, and a copy is identical but independent", async () => {
    const prepared = prepareImport("InterNACHI Residential.xlsx", workbookBytes());
    if (!prepared.ok) throw new Error(prepared.message);
    const args = buildImportArgs(prepared, "InterNACHI Residential");

    const { template_id, import_id } = await as(user, async (tx) => {
      const res = await tx.query<{ template_id: string; import_id: string }>(IMPORT_SQL, [
        args.p_name,
        args.p_filename,
        args.p_file_sha256,
        args.p_source_rows,
        JSON.stringify(args.p_summary),
        JSON.stringify(args.p_sections),
        JSON.stringify(args.p_issues),
      ]);
      return res.rows[0];
    });

    // 1. Database content equals parser output, field for field.
    const stored = await as(user, (tx) => readTree(tx, template_id));
    expect(stored).toEqual(prepared.parse.sections);

    // Spot-check the content that matters to the inspector.
    const missing = stored[0].items[0].comments[1];
    expect(missing.body_html).toBe('<span style="color:red">Safety:</span> shingles missing');
    expect(missing.extras).toEqual({ Category: "1", "Default Photo 1": "https://x/photo.jpg", "Surprise Column": "keep me" });
    expect(stored[0].items[1]).toMatchObject({ name: "Flashing", comments: [] });
    expect(stored[1].items[0].comments[0].body_html).toBe("Line one\nLine two &amp; more");

    // 2. Every issue was persisted, and the template links to its import.
    const persisted = await as(user, async (tx) => ({
      issues: (await tx.query<{ n: number }>(`select count(*)::int as n from public.import_issues where import_id = $1`, [import_id])).rows[0].n,
      importId: (await tx.query<{ import_id: string }>(`select import_id from public.templates where id = $1`, [template_id])).rows[0].import_id,
    }));
    expect(persisted.issues).toBe(prepared.parse.issues.length);
    expect(persisted.importId).toBe(import_id);
    expect(prepared.parse.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["html_sanitized", "unknown_column_preserved", "column_preserved", "section_filled_down"]),
    );

    // 3. Copy equals original, keeps the import link, and edits don't leak across.
    const copyId = await as(user, async (tx) =>
      (await tx.query<{ id: string }>(`select public.duplicate_template($1, 'Copy') as id`, [template_id])).rows[0].id,
    );
    expect(await as(user, (tx) => readTree(tx, copyId))).toEqual(stored);

    await as(user, (tx) =>
      tx.query(`update public.comments set body_html = 'Edited in copy', version = version + 1 where template_id = $1`, [copyId]),
    );
    expect(await as(user, (tx) => readTree(tx, template_id))).toEqual(prepared.parse.sections);
  });

  it("optimistic concurrency: a stale version updates nothing", async () => {
    const prepared = prepareImport("t.xlsx", workbookBytes());
    if (!prepared.ok) throw new Error(prepared.message);
    const args = buildImportArgs(prepared, "Concurrency");
    await as(user, async (tx) => {
      const { template_id } = (
        await tx.query<{ template_id: string }>(IMPORT_SQL, [
          args.p_name, args.p_filename, args.p_file_sha256, args.p_source_rows,
          JSON.stringify(args.p_summary), JSON.stringify(args.p_sections), JSON.stringify(args.p_issues),
        ])
      ).rows[0];
      const section = (await tx.query<{ id: string }>(`select id from public.sections where template_id = $1 limit 1`, [template_id])).rows[0];
      const first = await tx.query(`update public.sections set name = 'Tab A', version = 2 where id = $1 and version = 1`, [section.id]);
      const second = await tx.query(`update public.sections set name = 'Tab B', version = 2 where id = $1 and version = 1`, [section.id]);
      expect([first.affectedRows, second.affectedRows]).toEqual([1, 0]);
    });
  });
});
