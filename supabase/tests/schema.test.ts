/**
 * Database guarantees the app relies on, checked against the real migration in PGlite:
 * atomic import, order preservation, copy independence, RLS isolation, reordering, quotas.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser, IMPORT_SQL } from "./helpers";

let db: PGlite;
let as: ReturnType<typeof asUser>;
let alice: string;
let bob: string;

const sampleTree = [
  {
    name: "Roof",
    source_row: 2,
    extras: {},
    items: [
      {
        name: "Coverings",
        source_row: 2,
        extras: {},
        comments: [
          { title: "Asphalt shingles", body_html: "<p>Roof is <b>asphalt</b>.</p>", comment_type: "Information", source_row: 2, extras: {} },
          { title: "Missing shingles", body_html: "Shingles were missing.", comment_type: "Deficiency", source_row: 3, extras: { Location: "North slope" } },
        ],
      },
      { name: "Flashing", source_row: 4, extras: {}, comments: [] },
    ],
  },
  {
    name: "Exterior",
    source_row: 5,
    extras: {},
    items: [{ name: "Siding", source_row: 5, extras: {}, comments: [{ title: "Vinyl", body_html: "Vinyl siding 🏠", comment_type: null, source_row: 5, extras: {} }] }],
  },
];

async function importAs(user: string, name = "InterNACHI Residential", sections: unknown = sampleTree) {
  return as(user, async (tx) => {
    const res = await tx.query<{ template_id: string; import_id: string }>(IMPORT_SQL, [
      name,
      "export.xlsx",
      "a".repeat(64),
      5,
      JSON.stringify({ sections: 2 }),
      JSON.stringify(sections),
      JSON.stringify([{ source_row: 6, severity: "warning", category: "unsupported", code: "x", message: "m", detail: {} }]),
    ]);
    return res.rows[0];
  });
}

async function tree(user: string, templateId: string) {
  return as(user, async (tx) => {
    const res = await tx.query<{ section: string; item: string | null; title: string | null; body_html: string | null }>(
      `select s.name as section, i.name as item, c.title, c.body_html
       from public.sections s
       left join public.items i on i.section_id = s.id
       left join public.comments c on c.item_id = i.id
       where s.template_id = $1
       order by s.position, i.position, c.position`,
      [templateId],
    );
    return res.rows;
  });
}

beforeAll(async () => {
  db = await createTestDb();
  as = asUser(db);
  alice = await createUser(db);
  bob = await createUser(db);
});

describe("import_template", () => {
  it("stores the full hierarchy in source order", async () => {
    const { template_id } = await importAs(alice);
    expect(await tree(alice, template_id)).toEqual([
      { section: "Roof", item: "Coverings", title: "Asphalt shingles", body_html: "<p>Roof is <b>asphalt</b>.</p>" },
      { section: "Roof", item: "Coverings", title: "Missing shingles", body_html: "Shingles were missing." },
      { section: "Roof", item: "Flashing", title: null, body_html: null },
      { section: "Exterior", item: "Siding", title: "Vinyl", body_html: "Vinyl siding 🏠" },
    ]);
  });

  it("records the import and its issues, and links the template to it", async () => {
    const { template_id, import_id } = await importAs(alice);
    const result = await as(alice, async (tx) => ({
      issues: (await tx.query(`select code from public.import_issues where import_id = $1`, [import_id])).rows.length,
      link: (await tx.query<{ import_id: string }>(`select import_id from public.templates where id = $1`, [template_id])).rows[0].import_id,
    }));
    expect(result).toEqual({ issues: 1, link: import_id });
  });

  it("is atomic: a bad row rolls back the whole template", async () => {
    const count = () => as(alice, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from public.templates`));
    const before = (await count()).rows[0].n;
    const broken = [...sampleTree, { name: null, source_row: 9, extras: {}, items: [] }];
    await expect(importAs(alice, "Broken", broken)).rejects.toThrow();
    expect((await count()).rows[0].n).toBe(before);
  });

  it("rejects an empty template", async () => {
    await expect(importAs(alice, "Empty", [])).rejects.toThrow(/no sections/);
  });

  it("is not callable anonymously", async () => {
    await expect(
      as(null, (tx) => tx.query(`select public.duplicate_template($1::uuid, 'x')`, [randomUUID()])),
    ).rejects.toThrow(/permission denied/);
  });

  it("rate-limits imports per user", async () => {
    const carol = await createUser(db);
    await as(carol, (tx) =>
      tx.query(
        `insert into public.imports (filename, file_sha256, source_rows)
         select 'f.xlsx', repeat('b', 64), 1 from generate_series(1, 30)`,
      ),
    );
    await expect(importAs(carol)).rejects.toThrow(/rate limit/);
  });
});

describe("duplicate_template", () => {
  it("creates an independent deep copy", async () => {
    const { template_id: original } = await importAs(alice);
    const copy = await as(alice, async (tx) =>
      (await tx.query<{ id: string }>(`select public.duplicate_template($1, 'Copy') as id`, [original])).rows[0].id,
    );

    expect(await tree(alice, copy)).toEqual(await tree(alice, original));

    await as(alice, async (tx) => {
      await tx.query(`update public.sections set name = 'Roof (edited)' where template_id = $1 and position = 0`, [copy]);
      await tx.query(`update public.items set name = 'Coverings (edited)' where template_id = $1 and name = 'Coverings'`, [copy]);
      await tx.query(`update public.comments set body_html = 'changed' where template_id = $1`, [copy]);
      await tx.query(`delete from public.items where template_id = $1 and name = 'Flashing'`, [copy]);
    });

    const originalTree = await tree(alice, original);
    expect(originalTree[0]).toEqual({ section: "Roof", item: "Coverings", title: "Asphalt shingles", body_html: "<p>Roof is <b>asphalt</b>.</p>" });
    expect(originalTree).toHaveLength(4);

    await as(alice, (tx) => tx.query(`delete from public.templates where id = $1`, [original]));
    const copyTree = await tree(alice, copy);
    expect(copyTree).toHaveLength(3);
    expect(copyTree[0].section).toBe("Roof (edited)");
  });

  it("cannot copy another user's template", async () => {
    const { template_id } = await importAs(alice);
    await expect(as(bob, (tx) => tx.query(`select public.duplicate_template($1, 'Stolen')`, [template_id]))).rejects.toThrow(/not found/);
  });

  it("enforces the per-user template quota", async () => {
    const dave = await createUser(db);
    await as(dave, (tx) => tx.query(`insert into public.templates (name) select 't' || g from generate_series(1, 200) g`));
    await expect(importAs(dave)).rejects.toThrow(/template limit/);
  });
});

describe("row level security", () => {
  it("hides other users' templates and children", async () => {
    const { template_id, import_id } = await importAs(alice);
    const seen = await as(bob, async (tx) => ({
      templates: (await tx.query(`select 1 from public.templates where id = $1`, [template_id])).rows.length,
      comments: (await tx.query(`select 1 from public.comments where template_id = $1`, [template_id])).rows.length,
      issues: (await tx.query(`select 1 from public.import_issues where import_id = $1`, [import_id])).rows.length,
    }));
    expect(seen).toEqual({ templates: 0, comments: 0, issues: 0 });
  });

  it("blocks writes into another user's template", async () => {
    const { template_id } = await importAs(alice);
    await expect(
      as(bob, (tx) => tx.query(`insert into public.sections (template_id, position, name) values ($1, 99, 'Injected')`, [template_id])),
    ).rejects.toThrow(/row-level security/);
    const updated = await as(bob, (tx) => tx.query(`update public.sections set name = 'Hacked' where template_id = $1`, [template_id]));
    expect(updated.affectedRows).toBe(0);
  });

  it("prevents a child pointing at a parent in a different template", async () => {
    const a = await importAs(alice);
    const b = await importAs(alice);
    await expect(
      as(alice, async (tx) => {
        const sec = await tx.query<{ id: string }>(`select id from public.sections where template_id = $1 limit 1`, [a.template_id]);
        await tx.query(`insert into public.items (template_id, section_id, position, name) values ($1, $2, 50, 'x')`, [b.template_id, sec.rows[0].id]);
      }),
    ).rejects.toThrow(/foreign key/);
  });
});

describe("private staging storage", () => {
  it("limits uploaded source files to the authenticated user's folder", async () => {
    const bucket = (await db.query<{ public: boolean; file_size_limit: number }>(
      `select public, file_size_limit from storage.buckets where id = 'template-import-staging'`,
    )).rows[0];
    expect(bucket).toEqual({ public: false, file_size_limit: 20971520 });

    const ownPath = `${alice}/${randomUUID()}.xlsx`;
    await as(alice, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('template-import-staging', $1)`, [ownPath]));
    await expect(as(bob, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('template-import-staging', $1)`, [`${alice}/${randomUUID()}.xlsx`]))).rejects.toThrow(/row-level security/);
    await expect(as(alice, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('template-import-staging', $1)`, [`${alice}/${randomUUID()}.exe`]))).rejects.toThrow(/row-level security/);
    expect((await as(bob, (tx) => tx.query(`select name from storage.objects where name = $1`, [ownPath]))).rows).toEqual([]);
    expect((await as(alice, (tx) => tx.query(`select name from storage.objects where name = $1`, [ownPath]))).rows).toHaveLength(1);
    expect((await as(bob, (tx) => tx.query(`delete from storage.objects where name = $1`, [ownPath]))).affectedRows).toBe(0);
  });
});

describe("move_node", () => {
  it("swaps with the neighbour and is a no-op at the edges", async () => {
    const { template_id } = await importAs(alice);
    const names = () =>
      as(alice, async (tx) =>
        (await tx.query<{ name: string }>(`select name from public.sections where template_id = $1 order by position`, [template_id])).rows.map((r) => r.name),
      );
    const exteriorId = await as(alice, async (tx) =>
      (await tx.query<{ id: string }>(`select id from public.sections where template_id = $1 and name = 'Exterior'`, [template_id])).rows[0].id,
    );

    await as(alice, (tx) => tx.query(`select public.move_node('section', $1, -1)`, [exteriorId]));
    expect(await names()).toEqual(["Exterior", "Roof"]);
    await as(alice, (tx) => tx.query(`select public.move_node('section', $1, -1)`, [exteriorId]));
    expect(await names()).toEqual(["Exterior", "Roof"]);
  });

  it("rejects unknown kinds", async () => {
    await expect(
      as(alice, (tx) => tx.query(`select public.move_node('templates; drop table x', $1, 1)`, [randomUUID()])),
    ).rejects.toThrow(/unknown kind/);
  });
});
