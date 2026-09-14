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
- SheetJS 0.20.x from cdn.sheetjs.com — npm `xlsx@0.18.5` has known prototype-pollution and ReDoS CVEs.
