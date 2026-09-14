# NOTES

> Items marked **[TODO before submitting]** need first-hand
> product exploration. Everything else describes what is built and tested.

## At a glance
- **Live app:** https://spectora-template-importer.vercel.app
- **Login:** confirmed demo account — see README → *Reviewer access*. It opens on the seeded **InterNACHI Residential** template (13 sections, 392 comments), imported from the committed fixture. Checked in a browser on the live URL on 2026-09-15.
- **Input file:** `fixtures/InterNACHI Residential.xlsx` — Spectora Template Center *InterNACHI Residential*,
  template ID `334635`, exported via *Export to spreadsheet → Export HTML Text* on 2026-09-14 from a trial
  account. Shareable sample content only; fingerprint and source details are in `fixtures/README.md`.

## What I built
| Baseline | How |
|---|---|
| Import | Upload → **preview** (nothing saved) → confirm → one-transaction commit. Every skipped, changed or unsupported cell is listed with its row number and original values. |
| Edit | Rename template, sections, items; edit comment names and text (visual editor, or HTML mode when the visual editor would lose formatting); add, delete and reorder sections, items and comments. |
| Copy | `duplicate_template` deep-copies every row with new ids. Copies share nothing with the original. |
| Store | Supabase Postgres with row-level security; per-row version numbers prevent silent overwrites between tabs. |
| Model | `templates → sections → items → comments`, plus `imports` and `import_issues`. HTML only inside `comments.body_html`. See `docs/schema.md`. |

### Where I went further: making the import easy to trust
**Customer problem.** An inspection company with four years of tuning won't switch on faith. Their real question
is *"what did I lose?"* A silent importer, even a good one, can't answer that.

**What I built.**
- **A preview before anything is saved.** It shows what will be created and the column mapping. For large exports,
  exact totals accompany a sample of the tree and issues; the full issue list is in the saved import report.
- **A cell-by-cell reconciliation.** Every filled cell in the file is either imported, kept as read-only data, or listed as an issue. The UI shows the three totals adding up.
- **Grouped issues.** They are split into *missing from the export*, *not editable here*, *formatting changed*, and *rows & grouping*. Each has a row number, the original values, and a link to the comment in the editor.
- **An import report kept with the template (and its copies).** It includes the file's SHA-256 fingerprint, and warns when the same file has already been imported.

**Why this over a nicer editor.** Editing is only valuable once the customer believes the data arrived intact. I kept the editor simple and put the extra time into proof.

## Formatting, links and rich content
- **Kept:** paragraphs, line breaks, `div`/`span`, headings, bold/italic/underline/strike, lists, blockquotes, tables, `http`/`https`/`mailto` links, and a safe subset of inline styles (colour, background colour, alignment, weight, style, decoration).
- **Removed, and each removal reported on its row:**
  - scripts and styles
  - event handlers
  - `javascript:` and protocol-relative links
  - other CSS properties
  - images and embedded video (the report shows the URL)
- **Plain-text comments** keep their line breaks.
- **Display:** stored HTML is cleaned again when shown, and links open in a new tab with `rel="noopener noreferrer nofollow"`.
- **Editing:** the visual editor is used only when it can represent the comment without loss (D11).

**Limits:**
- Images aren't downloaded or re-hosted.
- Inline styles outside the allowed list are dropped.
- The HTML editor has no live preview.

### Missing from the export vs unsupported by the importer
- **Missing from the export** (can't be recovered from the file):
  - template name (taken from the filename)
  - section- and item-level settings
  - report layout
  - uploaded photos beyond default-photo URLs
  - comments with no text
- **Unsupported by this importer** (present in the file, preserved as read-only data on each comment, not editable):
  - category/severity
  - information-field answer settings and defaults
  - recommendation
  - location, estimates
  - locked / simple format / disable photos
  - usage count, default photos, last modified
  - any unknown column (flagged as a warning)
- **Also unsupported:** inline media and non-allowlisted HTML/CSS (removed and reported, per the rules above).
- **Verified against the committed export:** its annotated Comment Type header is mapped to the editable
  field; other annotated Spectora headers are recognised and retained as read-only extras. No unknown columns.

## Failure cases handled
- Wrong file type, a renamed or corrupt file, an empty file, over 20 MB, password-protected, or a zip bomb.
- **Spectora's plain-text export:** detected by name, with instructions to use the HTML-text export instead.
- **Not a Spectora export:** a missing Section/Item header is rejected, showing the headers that were found.
- **Rows that can't be placed**, or values too long to store: those rows are skipped, the rest imports, and each skipped row appears with its values.
- **Everything in the file unimportable:** the import is rejected with the reasons.
- **Database error during commit:** the transaction rolls back and nothing is saved.
- **File changed between preview and commit:** rejected (409).
- **Rate limit or template quota reached:** a clear message is shown.
- **Edit conflict from another tab:** the save is refused and a *Reload latest* option is offered.
- **Deleted or foreign template:** a not-found page. **Database outage:** an error page with retry.

## How I checked my work
- **Automated tests: 356 across 46 files**, all passing in CI on 2026-09-15, including repeated-source-row, invented-node, and formatting-loss checks (`npm run test:coverage` fails below 100% coverage). Catalogue with IDs, inputs and expected results: `docs/TEST_CASES.md`.

  | Layer | What it covers |
  |---|---|
  | Unit | parser, HTML cleaner, independent preservation verifier, file checks, commit helpers, editor-compatibility check |
  | Server | every server action (validation, edit conflict vs not found, database error mapping, position retry), upload route (401/413/400/409/422/429/500), login and sign-up (no open redirects, no account enumeration), email confirmation, auth proxy, paginated queries, Supabase cookie handling. Uses a small fake Supabase client that records each query. |
  | Component (jsdom) | import wizard (failures, preview, commit with fingerprint, stale response ignored), comment editor (HTML mode protects formatting, save/conflict/⌘S/unsaved guard), rename, add/move/delete dialogs, issue list, reconciliation, tree preview, visual-editor toolbar, all pages |
  | Database (PGlite, real migrations) | atomic import, order, parser output = stored rows, copy independence, RLS isolation, cross-template FK, reordering, stale versions, quota, rate limit, private Storage owner policies |
  | End-to-end (Playwright) | 5 browser scenarios: bad files → preview → import → edit → reload → duplicate → edit copy → original unchanged → report. All 5 passed against the public Vercel URL with a generated test export. |

  The generated-data run passed on the live URL on 2026-09-15.

  **Real export, live (2026-09-15):** `e2e/real-export.spec.ts` passed against the public URL in 50 s. It uploads `fixtures/InterNACHI Residential.xlsx` and checks, in order:
  - the preview shows every cell accounted for
  - the import creates 13 sections
  - a section rename survives a reload
  - a comment edit survives a reload
  - a duplicate is created and its comment edited, leaving the original unchanged
  - the import report opens

  It runs as a dedicated end-to-end account, separate from the reviewer demo account, and deletes both templates it creates. Afterwards the demo account was unchanged (one template, same version and timestamp) and the test account held no templates.

- **Coverage (V8, all of `src/`):** 100% lines, statements, branches and functions, enforced in CI.
  - Unit and integration tests target different code; separate-layer coverage needs remeasurement after the grouping change.
  - **End-to-end:** 5/5 scenarios passed; browser code coverage is not collected.
  - **No ignore comments:** unreachable fallbacks were deleted instead.
- **Bugs the tests caught and I fixed:**
  - `safeFilename` stripped spaces and punctuation from filenames.
  - Rename could save twice (Enter disables the field, which blurs it), causing a false "changed elsewhere" conflict.
  - A failed sign-in wiped the email field (React 19 resets forms after an action).
  - The visual editor saved a stray `<p></p>` after lists.
  - After pressing Esc on a rename, the next rename was silently discarded when you clicked away.
- **Original unit and database checks in detail:**
  - **Parser:** hierarchy, order, fill-down, non-contiguous grouping, unknown/duplicate columns, CSV quoting/BOM, over-long values, damaged xlsx, zip bomb, determinism. Conservation is asserted in each case.
  - **Cleaner:** allowlist, XSS vectors, style filtering, media reporting.
  - **Preservation check:** proven to catch dropped, moved and altered content.
  - **Database, on the real migration in PGlite:**
    - the import is atomic
    - order is preserved
    - what the parser produced is exactly what the database stores
    - copies are identical yet independent, and editing or deleting one leaves the other intact
    - users can't see or change each other's data
    - a child row can't point at another template's parent
    - reordering works
    - stale versions are rejected
    - quotas and rate limits are enforced
- **`npm run verify:export -- 'fixtures/InterNACHI Residential.xlsx'`:** 13 sections, 69 items, 392 comments;
  all 392 data rows checked, 0 skipped, 0 mismatches, 0 unaccounted rows. All 4,611 filled cells are accounted
  for (1,877 editable/stored, 2,734 read-only, 0 reported). There are 0 warnings/errors; 39 rows have
  reported cosmetic HTML changes (mostly removed link attributes), and 83 comments have empty text in the
  source but retain their names and other fields. The sample has no repeated section or item runs; generated
  regression cases verify that non-contiguous and explicitly declared repeated names remain separate.
- **Manual pass on the live app** **[TODO before submitting]**:
  1. Import the fixture.
  2. Rename a section, item and comment; reload and confirm the changes stuck.
  3. Duplicate the template, edit the copy, and confirm the original is unchanged.
  4. Upload a `.txt` file and a random `.xlsx` to see the error screens.
- `npm run typecheck`, `npm run lint`, `next build`.

## Security, performance and scale
- **Security:**
  - Row-level security on every table.
  - Database functions run as the signed-in user, so its permissions still apply.
  - The service-role key is used only server-side by the seed script and secret-protected cleanup cron.
  - Server actions and the upload route validate all input with zod.
  - Redirects after login only go to pages within the app.
  - Login errors don't reveal whether an account exists.
- **Upload hardening:** 4 MB direct / 20 MB private staged cap, content sniffing, zip-bomb guard, row cap,
  server-only parsing, owner-only Storage policies, and daily cleanup of abandoned staged objects.
- **Performance:**
  - Import and copy are each one database call.
  - The editor loads one section at a time.
  - Only one comment editor is open at a time.
  - Comment bodies in the preview render only when opened.
  - Reads that can exceed Supabase's 1,000-row limit are paginated.
- **Scale:** preview and commit keep no in-process state, so any instance can serve either step. Large imports
  use temporary private Storage objects that are deleted after commit or after 24 hours by the cron.

## What I cut, and why
- **Drag-and-drop reordering:** up/down buttons are reliable and accessible; drag-and-drop is polish.
- **Bulk find/replace, undo history, version history:** valuable, but secondary to proving the import is trustworthy.
- **Editing the read-only Spectora fields** (severity, answer settings): they need a real field model, and preserving them was the priority.
- **Re-import with merge/diff:** the hardest case, but first-time import has to be trustworthy before merging makes sense.
- **Image re-hosting:** hotlinking Spectora URLs is fragile, and copying them raises data-ownership questions.
- **Export back to Spectora format, and teams/sharing:** out of scope for switching one company.

## Known limitations
- Only the first sheet is read; other sheets are reported.
- Consecutive rows with the same section/item name form one run. If a name returns after another, it starts a
  separate section/item to preserve row order, and the import report flags the ambiguity for review.
- **Order column:** if it disagrees with row order, row order wins and a warning is shown.
- Rows over the length limits are skipped rather than stored.
- **Upload size:** capped at 20 MB. Files above 4 MB use private, resumable Storage upload because of Vercel's
  request-body limit. Large previews show a bounded sample, with the full report available after commit.
- **Zip-bomb guard:** it relies on the sizes the zip file declares.

## AI usage
- **Building:** Claude Code. It helped with research, planning, code, tests and reviews, and I checked the output. Reusable project knowledge is in `CLAUDE.md`, `docs/*.md` and `.claude/skills/import-fixture/SKILL.md`.
- **In the product: no LLM.** The export is already structured, so a parser that follows fixed rules is reproducible, testable, and can't invent sections or drop comments. Unknown columns are preserved and flagged rather than guessed at.

## Hive vs Binsr **[TODO before submitting]**
First-hand notes from the Hive trial (sample inspection, published report, template import) and, if explored,
Binsr: what each makes easier, and what Hive could learn. If only Hive was explored, say why.

## Time spent **[TODO before submitting]**
Product exploration · building · deployment · walkthrough.

## Credits
Next.js 16, React 19, Tailwind CSS 4, Supabase (Postgres, Auth, `@supabase/ssr`), SheetJS CE 0.20.3, sanitize-html,
htmlparser2, Tiptap 3, zod 4, Vitest, PGlite (in-process Postgres for tests), tsx. Chart colours come from the dataviz
reference palette, validated for colour-vision deficiency. My contribution: the import pipeline, schema and
database functions, preservation checks, the editor and the import-trust UI.
