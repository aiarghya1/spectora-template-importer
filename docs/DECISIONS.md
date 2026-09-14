# Decisions

Short architecture decision log. Each entry: decision, why, what we gave up.

## D1 — Next.js (App Router) + Supabase Postgres + Vercel
- **Why:** Vercel-native, one deployable; Postgres gives transactions and constraints so imports and copies are all-or-nothing.
- **Gave up:** a separately scalable API service (not needed at this scale).

## D2 — Deterministic importer, no LLM in the product
- **Why:** The export is already tabular. Deterministic parsing is reproducible, testable, and cannot invent or drop content. The customer's fear is silent loss of four years of tuning.
- **Gave up:** fuzzy mapping of exotic/unknown column layouts. Unknown columns are preserved in `extras` and reported instead.

## D3 — Normalised schema: templates → sections → items → comments
- Integer `position` with `unique(parent_id, position)`; unknown source columns kept in `extras jsonb`.
- Every import is recorded (`imports`) with per-row issues (`import_issues`) so nothing is dropped invisibly.
- **Gave up:** a generic node tree (more flexible, harder to validate and explain).

## D4 — Atomic import and copy via Postgres functions (RPC)
- Import: one RPC receives the whole validated tree as JSON → single transaction, single round trip.
- Copy: `duplicate_template(id)` deep-copies with new ids. No shared rows ⇒ edits to a copy cannot affect the original.
- **Gave up:** copy-on-write storage savings (templates are thousands of rows; negligible).

## D5 — Optimistic concurrency
- `templates.version` is bumped on every edit; stale writes get a conflict instead of a silent overwrite (two tabs, two people).

## D6 — Rich content: allowlist sanitisation, never silent
- Allowed: `p br b strong i em u ul ol li a[href]` (href: http, https, mailto). Everything else stripped.
- Every stripped tag/attribute is logged as an import issue. Sanitised again on render (defence in depth).

## D7 — Auth: Supabase email/password + RLS, demo account for reviewers
- **Why:** real ownership; the public demo can't be vandalised by anonymous visitors.
- **Gave up:** zero-friction access (mitigated by demo credentials in README).

## D8 — "Go further": import trust
- Dry-run preview before commit, row reconciliation (source rows vs stored), source-row ↔ parsed view, actionable issue list.
- **Why:** a switching customer needs proof nothing was lost before they trust the new tool.

## D9 — Upload limits & parsing safety
- 4 MB cap (Vercel function body limit is 4.5 MB), row cap, content sniffing (not just extension), server-side parsing only.
- Upload goes through a Route Handler, not a Server Action: Next 16 caps Server Action bodies at 1 MB by default,
  and a Route Handler lets us return structured error codes for the failure-case UI.

## D10 — Stateless preview → commit
- Preview parses and returns the result; nothing is stored. Commit re-uploads the same file, re-parses on the
  server and checks the SHA-256 matches the preview.
- **Why:** never trust a client-sent tree; no draft tables to clean up; any server instance can handle either step.
- **Gave up:** a second upload of the same bytes (≤ 4 MB, acceptable).

## D11 — Visual editor only where it is lossless
- Tiptap silently drops markup outside its schema (colour spans, tables, divs). Comments containing such markup
  open in HTML mode; switching to visual mode warns first. The editor saves only after a real edit.
- **Why:** opening a comment must never degrade four years of formatting.
- **Gave up:** a single editing mode for every comment.

## D12 — Two independent preservation checks
- **Conservation totals** inside the parser: filled cells = stored + read-only extras + reported.
- **`verifyPreservation`** re-reads the spreadsheet with its own row walk and compares every row with the result
  (section, item, title, visible text, type, extras, order). Tests prove it catches dropped, moved and altered content.
- **Why:** a parser checking only itself can share its own bug.

## D13 — Abuse limits in the database
- 30 imports per user per hour, 200 templates per user, text length CHECKs. Enforced in Postgres so they hold
  for direct API calls too, not just the UI.
- **Gave up:** configurable limits (not needed for this scope).
- SheetJS 0.20.x from cdn.sheetjs.com — npm `xlsx@0.18.5` has known prototype-pollution and ReDoS CVEs.
