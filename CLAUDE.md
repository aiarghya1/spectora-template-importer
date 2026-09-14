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
- Tests: `npm test` (vitest). New import edge case ⇒ new fixture + test (see `.claude/skills/add-import-fixture`).
