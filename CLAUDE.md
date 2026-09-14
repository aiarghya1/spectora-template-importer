@AGENTS.md

# Spectora template importer — project guide

Web app: import a Spectora "Export HTML Text" spreadsheet, edit it, duplicate it, persist in Supabase.

## Read before working
- `docs/DECISIONS.md` — architecture decisions and trade-offs (update when a decision changes).
- `docs/import-invariants.md` — rules the importer must never break. Read before editing `src/lib/import/`.
- `docs/spectora-export-format.md` — column spec derived from the committed fixture.
- `docs/schema.md` — database model; migrations live in `supabase/migrations/`.

## Conventions
- TypeScript strict. Validate all external input (uploads, form data, RPC results) with zod.
- Importer is pure and deterministic: `parse(bytes) → ParseResult` with no I/O. DB writes happen only in RPCs.
- Never drop content silently: anything not stored goes to `import_issues`.
- Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`) must never be imported from client components.
- All user data access goes through RLS (`owner_id = auth.uid()`); don't bypass with the service role in request paths.
- Sanitise HTML with `src/lib/html/sanitize.ts` only — one allowlist, used at import and render.
- Tests: `npm test` (vitest). New import edge case ⇒ new fixture + test (see `.claude/skills/import-fixture/SKILL.md`).
- Build test spreadsheets with `buildXlsx` (`src/lib/import/__tests__/workbook.ts`); DB tests use
  `createTestDb`/`asUser` (`supabase/tests/helpers.ts`), which run the real migrations in PGlite.
- Any importer change must keep `npm run verify:export` clean on every file in `fixtures/`.
- Supabase returns at most 1000 rows per request: paginate (`fetchAll` in `src/lib/templates/queries.ts`).
- `DECISIONS.md` gets a new entry whenever a trade-off is made; `NOTES.md` is the reviewer-facing summary.
