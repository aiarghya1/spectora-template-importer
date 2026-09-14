# NOTES

> Items marked **[TODO before submitting]** need the real Spectora export, the deployed URL, or first-hand
> product exploration. Everything else describes what is built and tested.

## At a glance
- **Live app:** [TODO before submitting] Vercel URL
- **Login:** demo account — see README → *Reviewer access*
- **Input file:** [TODO before submitting] `fixtures/<file>.xlsx` — Spectora *InterNACHI Residential* (or the
  template actually used), exported via *Export to spreadsheet → Export HTML Text* on <date> from a trial account.
  Sample content only, no customer data.

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
- **A preview before anything is saved.** It shows what will be created, the column mapping, and the full issue list.
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
- **Unverified:** column handling follows Spectora's published spreadsheet spec. **[TODO before submitting]** Confirm or correct this against the committed export (`npm run verify:export`).

## Failure cases handled
- Wrong file type, a renamed or corrupt file, an empty file, over 4 MB, password-protected, or a zip bomb.
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
- **`npm test`** (67 tests):
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
- **`npm run verify:export -- fixtures/<file>`:** runs the independent row-by-row check (D12) against the real export. **[TODO before submitting]** Paste the result summary here.
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
  - The service-role key is used only by the seed script.
  - Server actions and the upload route validate all input with zod.
  - Redirects after login only go to pages within the app.
  - Login errors don't reveal whether an account exists.
- **Upload hardening:** size cap, content sniffing, zip-bomb guard, row cap, and parsing only on the server.
- **Performance:**
  - Import and copy are each one database call.
  - The editor loads one section at a time.
  - Only one comment editor is open at a time.
  - Comment bodies in the preview render only when opened.
  - Reads that can exceed Supabase's 1,000-row limit are paginated.
- **Scale:** preview and commit keep no server state, so any instance can serve either step.

## What I cut, and why
- **Drag-and-drop reordering:** up/down buttons are reliable and accessible; drag-and-drop is polish.
- **Bulk find/replace, undo history, version history:** valuable, but secondary to proving the import is trustworthy.
- **Editing the read-only Spectora fields** (severity, answer settings): they need a real field model, and preserving them was the priority.
- **Re-import with merge/diff:** the hardest case, but first-time import has to be trustworthy before merging makes sense.
- **Image re-hosting:** hotlinking Spectora URLs is fragile, and copying them raises data-ownership questions.
- **Export back to Spectora format, and teams/sharing:** out of scope for switching one company.

## Known limitations
- Only the first sheet is read; other sheets are reported.
- Items with the same name in the same section are merged, because the export can't tell them apart.
- **Order column:** if it disagrees with row order, row order wins and a warning is shown.
- Rows over the length limits are skipped rather than stored.
- **Upload size:** capped at 4 MB, because of Vercel's request-body limit.
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
