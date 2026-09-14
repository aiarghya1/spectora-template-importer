# Schema

Migration: `supabase/migrations/20260914000000_template_schema.sql`.

```
templates ─┬─< sections ─< items ─< comments
           └─< imports ─< import_issues        (imports.template_id is SET NULL on delete: audit survives)
```

| Table | Purpose | Key columns |
|---|---|---|
| `templates` | One editable template, owned by a user | `owner_id`, `name`, `copied_from_id`, `version` |
| `sections` | Top-level groups (e.g. Roof) | `template_id`, `position`, `name`, `source_row`, `extras` |
| `items` | Inspectable things in a section | `section_id`, `template_id`, `position`, `name` |
| `comments` | Canned narrative text for an item | `item_id`, `template_id`, `position`, `title`, `body_html`, `comment_type` |
| `imports` | Audit of each committed import | `filename`, `file_sha256`, `source_rows`, `summary` |
| `import_issues` | Everything skipped, sanitised or unsupported, per source row | `severity`, `category`, `code`, `message`, `detail` |

## Design notes
- **Ordering:** integer `position`, `unique(parent, position) deferrable initially deferred` so swaps work in
  one transaction. Deletes leave gaps; order is by `position`, so gaps are harmless.
- **`template_id` on every child:** makes RLS a single indexed lookup and makes copy/delete set-based.
  Composite FKs `(parent_id, template_id)` guarantee a child can never point at a parent in another template.
- **`extras jsonb`:** source columns we don't model yet are kept per entity, never dropped (invariant 1).
- **`source_row`:** 1-based spreadsheet row, for traceability back to the export.
- **`version` per row:** optimistic concurrency. Updates filter on `version = expected`; zero rows ⇒ conflict.
- **Limits as CHECKs:** names ≤ 500 chars, comment HTML ≤ 200k chars — stops pathological input at the DB.

## Functions (SECURITY INVOKER, so RLS applies; `search_path = ''`)
- `import_template(name, filename, sha256, source_rows, summary, sections jsonb, issues jsonb)` — whole tree in one
  transaction. Array order becomes `position`.
- `duplicate_template(source_id, name)` — deep copy with fresh ids; copies share no rows with the source.
- `move_node(kind, id, direction)` — swap with previous/next sibling.

## Security
- RLS on every table: `owner_id = auth.uid()` (templates, imports) or `owns_template(template_id)` (children).
- Functions are not executable by `anon`.
- The service-role key is used by `scripts/seed.ts` and the bearer-token-protected daily cleanup route only.
  Ordinary user requests run with the user's Supabase session and RLS.
