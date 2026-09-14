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
- Files up to 4 MB go through the Route Handler. Files from 4 to 20 MB upload directly to a private Supabase
  Storage bucket in resumable chunks, avoiding Vercel's 4.5 MB function-body limit. The server downloads and
  parses every file. The bucket and parser both enforce the 20 MB cap.
- Row cap, content sniffing (not just extension), zip-bomb guard, server-side parsing only.
- Upload goes through a Route Handler, not a Server Action: Next 16 caps Server Action bodies at 1 MB by default,
  and a Route Handler lets us return structured error codes for the failure-case UI.

## D10 — Preview → commit with a source fingerprint
- Small files are sent again on commit. Large files stay in private Storage until commit; both requests parse
  server-side and commit checks the SHA-256 from preview. No client-sent tree is trusted.
- The preview response is bounded: large exports show exact totals and representative rows, while the full
  issue list appears in the saved report. This avoids exceeding the function response limit.
- Staged files are removed on success or preview discard. A secret-protected daily cron removes abandoned files
  older than 24 hours through the Storage API.

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

## D14 — Test at the layer where each risk lives
- **Import fidelity** → unit tests on the pure parser, plus an independent verifier.
- **Data guarantees** (atomicity, RLS, copy independence) → the real migration in PGlite, not mocks.
- **Server contracts** (validation, error mapping, redirects) → a recording fake Supabase client.
- **UI behaviour** → jsdom component tests.
- **The whole workflow** → Playwright against a real Supabase project.
- CI enforces 100% line, statement, branch and function coverage of `src/`. Code that can never run is deleted rather than hidden with coverage-ignore comments.
- **Gave up:** browser tests that run without a live Supabase project. Faking auth plus PostgREST
  would prove less than the PGlite and fake-client layers already do.
- SheetJS 0.20.x from cdn.sheetjs.com — npm `xlsx@0.18.5` has known prototype-pollution and ReDoS CVEs.
