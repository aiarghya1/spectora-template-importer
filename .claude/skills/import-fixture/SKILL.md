---
name: import-fixture
description: Add or verify a Spectora template export for the importer — commit it as a fixture, run the preservation check, update the format doc, and add tests for any new edge case. Use when a new export file arrives, when the importer fails on a file, or before changing src/lib/import/.
---

# Adding / verifying a Spectora export

Read `docs/import-invariants.md` first. The importer must never drop content silently.

## 1. Commit the file
- Put it in `fixtures/` with a descriptive name, e.g. `fixtures/internachi-residential-html-text.xlsx`.
- It must be the **Export to spreadsheet → Export HTML Text** file, not the plain-text export.
- Confirm it contains no real customer data (sample templates only).
- Record its source (which template, which Spectora account, export date) in `fixtures/README.md`.

## 2. Run the preservation check
```bash
npm run verify:export -- fixtures/<file>
```
It prints the column mapping, cell conservation totals, issue counts, and re-checks every row against the
file with an independent reader (`src/lib/import/verify.ts`). It exits non-zero on any mismatch.

## 3. Reconcile with the format doc
Compare the printed "Columns" block with `docs/spectora-export-format.md`:
- A column shows `extras` but should be a real field → add an alias in `FIELD_ALIASES` (`src/lib/import/columns.ts`).
- A recognised Spectora column shows as unknown → add it to `KNOWN_UNMODELLED` with a one-line note.
- Update the doc table and remove the "unverified" status note once confirmed against a real file.

## 4. Turn every surprise into a test
For any new edge case (odd header, merged cells, new HTML, blank rows…):
- Reproduce it with `buildXlsx` from `src/lib/import/__tests__/workbook.ts` in `parse.test.ts`.
- Assert the outcome *and* conservation (`expectConservation`).
- If content can't be imported, assert it appears as an issue with its row number and values.

## 5. Full check
```bash
npm test && npm run typecheck && npm run lint
```
Database behaviour (import, copy, RLS) is covered by `supabase/tests/*` running the real migration in PGlite.
