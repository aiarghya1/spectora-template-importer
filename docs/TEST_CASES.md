# Test cases

**Status (2026-09-14):**
- **Unit and integration:** 229 automated tests, all passing locally and in a fresh-clone replay of CI.
- **End-to-end:** 5 Playwright tests written, **not yet run** (they need the Supabase project and a test account).
- **Manual checks:** the checks against the real Spectora export and the deployment are **pending** (§4).

| Layer | What "unit / integration / e2e" means here | Tests | Status |
|---|---|---|---|
| Unit | Pure logic (parser, sanitiser, verifier, file checks) and UI components in isolation (jsdom, actions mocked) | 121 | ✅ passing |
| Integration | Server code wired together (actions, routes, auth, proxy, queries) against a recording fake Supabase client; pages composed with real components; **the real SQL migration** in PGlite | 108 | ✅ passing |
| End-to-end | A real browser against the running app and a real Supabase database | 5 | ⏳ written, not run |
| Manual / pending | Real Spectora export, seeded deployment | 6 | ⏳ not run |

Each row names the test file so it can be found. `(×n)` means one parameterised test that runs *n* cases.

## How to run
```bash
npm test                                         # unit + integration (229)
npm run test:coverage                            # same, with coverage limits (as CI)
npx vitest run src/lib/import                    # one area
E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e      # end-to-end against npm run dev (.env.local needed)
E2E_BASE_URL=https://… E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e   # against a deployment
npm run verify:export -- fixtures/<file>         # preservation check on a real export
```

---

## 1. Unit tests (121)

### 1.1 HTML sanitiser — `src/lib/html/__tests__/sanitize.test.ts` (14)
| ID | Test case | Input | Expected result |
|---|---|---|---|
| UT-SAN-01 | Allowed formatting and links are untouched | `<p><strong>…</strong><em>…</em><a href="https://…">` | Output identical; no changes reported |
| UT-SAN-02 | Block structure, lists and tables kept | two `<div>`s, `<ul>`, `<table>` with `colspan` | Output identical, so lines don't run together |
| UT-SAN-03 | Safe colour kept, unsafe style reported | `style="color: red; position: fixed"` | `style="color:red"`; change `style_removed: position` |
| UT-SAN-04 | Script removed with its content | `Hello<script>alert(1)</script> world` | `Hello world`; `tag_dropped: script` |
| UT-SAN-05 | Unsupported tags unwrapped, text kept | `<font>` ×2, `<center>` | Text `Red two mid`; `tag_unwrapped` font ×2, center ×1 |
| UT-SAN-06 | Images and embeds reported with source | `<img src=…>`, `<iframe src=…>` | Removed; `media_removed` with each URL; marked significant |
| UT-SAN-07 | Event handlers and `javascript:` links removed | `<a href="javascript:…" onclick=…>` | No `javascript`/`onclick`; link text kept; both changes reported |
| UT-SAN-08 | Obfuscated and protocol-relative links treated as unsafe | `" JaVaScRiPt:…"`, `//evil.example` | Both removed; 2 × `unsafe_link_removed` |
| UT-SAN-09 | `mailto:` kept, CRLF normalised | `Line one\r\nLine two <a href="mailto:…">` | LF line ending; link kept; no changes |
| UT-SAN-10 | Unicode and plain text preserved | `Ñandú — 20°F – “quoted” 🏠`; `Age < 20 years & older` | Identical text; `<` and `&` only entity-escaped |
| UT-SAN-11 | Empty input | `""` | `{ html: "", changes: [] }` |
| UT-SAN-12 | Changes described in plain language | `<img src="a.jpg">`, `<font>` ×2 | `Comment HTML changed: removed image (a.jpg); removed <font> formatting, kept its text ×2.` |
| UT-SAN-13 | Rendering adds safe link attributes | `<a href="https://example.com">` | `target="_blank"`, `rel="noopener noreferrer nofollow"` |
| UT-SAN-14 | Rendering re-strips unsafe markup that reached storage | `<img onerror>`, `onmouseover`, `style="background:url(javascript:1)"` | `ok`; `<p>t</p>` |

### 1.2 Visual-editor compatibility — `src/lib/html/__tests__/editor-compat.test.ts` (10)
| ID | Test case | Input | Expected result |
|---|---|---|---|
| UT-EDC-01 (×9) | Decide whether a comment must open in HTML mode | Plain text; `p/strong/em/ul`; `a[href]/h2/blockquote/hr`; `span style`; `div`; `table`; `sub`; `a target`; `p style` | First three → `false` (visual editor is lossless); the other six → `true` |
| UT-EDC-02 | Prepare plain text for the editor | `Line one\nLine two`; `<p>a</p>\n<p>b</p>` | `Line one<br>Line two`; HTML unchanged |

### 1.3 Upload file checks — `src/lib/import/__tests__/file-check.test.ts` (6)
| ID | Test case | Input | Expected result |
|---|---|---|---|
| UT-FIL-01 | Real spreadsheets accepted by content | Zip bytes `.xlsx`, OLE bytes `.XLS`, CSV with BOM | `ok` with kind `xlsx` / `xls` / `csv` |
| UT-FIL-02 | Empty and oversized files rejected | 0 bytes; 4 MB + 1 byte | `empty_file`; `too_large` |
| UT-FIL-03 | Plain-text export explained | `InterNACHI.txt` | `plain_text_export` |
| UT-FIL-04 | Other types rejected | `.pdf`; no extension | `unsupported_type` |
| UT-FIL-05 | Renamed or corrupt files rejected | Text named `.xlsx`; zip named `.csv`; UTF-16 bytes named `.csv` | `content_mismatch` |
| UT-FIL-06 | UTF-8 check on large files | Invalid byte inside the 64 KB sample; a valid `€` cut at the sample boundary | Invalid → `content_mismatch`; boundary → accepted |

### 1.4 Spectora parser — `src/lib/import/__tests__/parse.test.ts` (21)
Every successful case also asserts **conservation**: filled cells = stored + read-only extras + reported.

| ID | Test case | Input | Expected result |
|---|---|---|---|
| UT-PAR-01 | Hierarchy, order, text and HTML preserved | 5 rows, 3 sections, HTML links, emoji, a line break, Category/Order columns | Exact section → item → comment outline; comment fields and `extras` exact; stats 3/4/5 |
| UT-PAR-02 | Deterministic | Same bytes parsed twice | Deep-equal results |
| UT-PAR-03 | Headers matched loosely | `COMMENT  TEXT`, `item name`, `Section_Name`, `comment name`, reordered | Mapped correctly |
| UT-PAR-04 | Blank section/item cells fill down | Rows with blank Section and/or Item | Placed under the row above; `section_filled_down`, `item_filled_down` issues |
| UT-PAR-05 | Non-contiguous section grouped | Roof, Exterior, Roof | Roof has both comments, Exterior after it; warning lists row 4 |
| UT-PAR-06 | Empty items and sections kept | Item-only row; section-only row | Item with 0 comments; section with 0 items; counters 1/1 |
| UT-PAR-07 | Blank rows ignored but counted | Empty and whitespace-only rows | `blankRows: 2`; no effect on outline |
| UT-PAR-08 | Only name edges trimmed | `"  Roof "`, comment title/text with spaces | Names trimmed and reported; title and text kept verbatim |
| UT-PAR-09 | Row order wins over the Order column | Order 2 then 1 | File order kept; `order_column_differs` warning |
| UT-PAR-10 | Content above the header reported | Title row, blank row, then headers | `headerRow: 3`; `row_above_header` issue with the title text |
| UT-PAR-11 | Unknown, duplicate and unlabelled columns kept | `Inspector Notes`, second `Comment Text`, headerless column G | Extras `Inspector Notes`, `Comment Text (column F)`, `Column G`; 3 "unsupported" issues |
| UT-PAR-12 | Unplaceable rows skipped, values kept | No section above; section with no item | `missing_section` (row 2), `missing_item` (row 4) errors carrying the row's values; `skippedRows: 2` |
| UT-PAR-13 | Over-long values skipped, not truncated | 501-character section name | `value_too_long` on row 2; other rows import |
| UT-PAR-14 | Comment HTML sanitised per row | `<script>`, `<img>`, `javascript:` link | Stored `Ok<a>l</a>`; `html_sanitized` warning on row 2 naming the image URL |
| UT-PAR-15 | Extra sheets and missing template name reported | Second sheet "Notes" | `extra_sheet_ignored`; `template_name_from_filename` (missing from export) |
| UT-PAR-16 | CSV edge cases | BOM, quoted comma, doubled quotes, CRLF inside a cell, `007` | Exact text; `007` stays text |
| UT-PAR-17 | Not a Spectora export | Headers `Name`, `Description` | `missing_required_columns` with the headers it found |
| UT-PAR-18 | No comment columns | Only Section and Item headers | `no_comment_columns` |
| UT-PAR-19 | Nothing to import | Header only; every row unplaceable | `no_data_rows`; `no_importable_rows` |
| UT-PAR-20 | Damaged xlsx | File truncated to half | `unreadable` |
| UT-PAR-21 | Zip bomb | Central directory claims ~2 GB uncompressed | `too_large_uncompressed`, before unpacking |

### 1.5 Independent preservation verifier — `src/lib/import/__tests__/verify.test.ts` (4)
| ID | Test case | Input | Expected result |
|---|---|---|---|
| UT-VER-01 | Accepts a faithful parse | Workbook with title row, skipped row, fill-down, item-only, section-only, blank and regrouped rows | 0 mismatches, 0 unaccounted rows; 7 data / 4 comment / 2 structure / 1 reported |
| UT-VER-02 | Catches a dropped comment | Last Roof comment removed from the result | Row 10 unaccounted |
| UT-VER-03 | Catches altered content | Changed text, rewritten Category, two comments swapped | Mismatches on `text`, `Category`, `order` |
| UT-VER-04 | Catches a misplaced comment | Comment moved from Coverings to Flashing | Row 4, field `item`: expected Coverings, got Flashing |

### 1.6 Import commit helpers — `src/lib/import/__tests__/commit.test.ts` (6)
| ID | Test case | Input | Expected result |
|---|---|---|---|
| UT-COM-01 | Ordinary filename characters kept | `InterNACHI Residential - v2 (final) #3 & more.xlsx`; accents and emoji | Unchanged |
| UT-COM-02 | Paths and control characters stripped | `C:\Users\me\export.xlsx`, `../../etc/passwd`, BEL/DEL characters | `export.xlsx`, `passwd`, `badname.xlsx` |
| UT-COM-03 | Fallback and length cap | Only control characters; 300-character name | `upload`; 255 characters |
| UT-COM-04 | File-stage failure before parsing | `notes.txt` | `stage: file`, `plain_text_export` |
| UT-COM-05 | Parse-stage failure | xlsx with header `Name` | `stage: parse`, `missing_required_columns` |
| UT-COM-06 | Fingerprint and RPC payload | Valid xlsx parsed twice | Same 64-hex SHA-256; payload has name, filename, hash, sections, issues |

### 1.7 UI components in isolation (60)

**EditableText** — `src/components/__tests__/editable-text.test.tsx` (7)
| ID | Test case | Steps | Expected result |
|---|---|---|---|
| UT-EDT-01 | Enter saves the trimmed value | Click name, type `"  Roof covering "`, Enter | Saves `Roof covering`; "Saved"; new name shown |
| UT-EDT-02 | Leaving the field saves | Type, then Tab | Saves `Roof 2` |
| UT-EDT-03 | Esc cancels | Type, then Esc | No save; original name |
| UT-EDT-04 | Unchanged value | Enter without typing | No save; editor closes |
| UT-EDT-05 | Empty name refused | Clear, type spaces, Enter | "Section name can't be empty."; no save |
| UT-EDT-06 | Failed save keeps the draft | Save returns an error | Error message shown; input still holds `Roof!` |
| UT-EDT-07 | Progress shown, no double save | Enter while save is pending, then blur | "Saving…", input disabled, save called **once**, then "Saved" |

**Node controls** — `src/components/__tests__/node-controls.test.tsx` (5)
| ID | Test case | Steps | Expected result |
|---|---|---|---|
| UT-NOD-01 | Rename sends the latest version | Rename twice | Calls carry version 5, then 6 |
| UT-NOD-02 | Impossible moves disabled; failures shown | Last section: click up | Down disabled; `moveNode(section, s1, -1)`; error alert |
| UT-NOD-03 | Delete needs confirmation | Open dialog → Cancel → reopen → Delete | Cancel deletes nothing; Delete calls `deleteNode(item, i1)` |
| UT-NOD-04 | Add item | Open form, type `Gutters`, Add | Add disabled while empty; `addItem` called; form closes |
| UT-NOD-05 | Add failure keeps the form | Server returns a limit error; then Esc | Alert shown, form stays open; Esc closes it |

**CommentCard** — `src/components/__tests__/comment-card.test.tsx` (11)
| ID | Test case | Steps | Expected result |
|---|---|---|---|
| UT-CMT-01 | View mode | Render a defect comment with extras | Title, `defect`, `Row 12`, stored HTML; Spectora fields revealed by "Show other Spectora fields (2)" |
| UT-CMT-02 | Empty comment labelled | Blank title and body | "Untitled comment", "No comment text" |
| UT-CMT-03 | Move and delete | First comment: move down; delete → confirm | Up disabled; `moveNode` called; dialog says copies are unaffected; failure shown |
| UT-CMT-04 | Formatting protected | Edit a comment with a colour `span` | Opens in **HTML** tab with explanation; textarea has original; Save disabled |
| UT-CMT-05 | Simple comments use the visual editor | Edit `<p>…<b>…</b></p>` | **Visual** tab selected; formatting toolbar present |
| UT-CMT-06 | Warning before a lossy mode switch | HTML → Visual, decline | Confirm asked; stays in HTML |
| UT-CMT-07 | Save with version tracking | Change HTML, Save; edit title, Save again | First call version 4; "Saved, with safety changes" and new text; second call version 5 |
| UT-CMT-08 | Keyboard save | Ctrl+S after editing | Saved once |
| UT-CMT-09 | Conflict handling | Server returns `conflict` | Alert; "Reload latest" refreshes the page data |
| UT-CMT-10 | Unsaved-change guard | Edit, Cancel (No), Cancel (Yes) | Stays editing, then discards |
| UT-CMT-11 | No guard without changes | Edit, Cancel | Closes without asking |

**RichEditor** — `src/components/__tests__/rich-editor.test.tsx` (5)
| ID | Test case | Steps | Expected result |
|---|---|---|---|
| UT-RTE-01 | Loads content and toolbar | Render `<p>Roof is worn</p>` | Text shown; 6 toolbar buttons, none pressed |
| UT-RTE-02 | Changes reported as clean HTML | Bulleted list, then numbered list | `<ul><li><p>Roof is worn</p></li></ul>` (no trailing empty `<p>`), then `<ol>…` |
| UT-RTE-03 | Inline marks | Click Bold, Italic, Underline | Each shows pressed |
| UT-RTE-04 | Only safe link addresses | Link with `javascript:`, cancel, empty, `https://…` | `javascript:` rejected with alert; others accepted |
| UT-RTE-05 | Emptied editor | Select all, Backspace | Reports `""` |

**Template buttons** — `src/components/__tests__/template-buttons.test.tsx` (2)
| ID | Test case | Steps | Expected result |
|---|---|---|---|
| UT-TPL-01 | Duplicate dialog | Open, clear name, type `Pre-listing`, Create copy | Explains independence; default `InterNACHI (copy)`; empty name disables; server error shown |
| UT-TPL-02 | Delete template dialog | Open, Delete permanently | Says copies are unaffected; `deleteTemplate` called; failure shown |

**IssueList** — `src/components/import/__tests__/issue-list.test.tsx` (6)
| ID | Test case | Steps | Expected result |
|---|---|---|---|
| UT-ISS-01 | Severity counts and filter | Render 4 issues; click "Skipped (1)" | Chips All 4 / Skipped 1 / Review 2 / Note 1; only row 3 shown |
| UT-ISS-02 | Evidence shown | Render | Original row values (`Orphan`), `Rows: 7, 9`, "Whole file" labels |
| UT-ISS-03 | Type filter and editor link | Choose "Formatting changed"; then also Skipped | Description shown; link `/templates/t1?section=s1#item-i1`; combined filter → "No issues match these filters." |
| UT-ISS-04 | No editor links during preview | Render without a template id | No links |
| UT-ISS-05 | Long lists paged | 450 issues, Show more ×2 | 200 → 400 → 450; button disappears |
| UT-ISS-06 | Nothing to review | Empty list | "No issues: every row imported as-is." |

**Reconciliation** — `src/components/import/__tests__/reconciliation.test.tsx` (3)
| ID | Test case | Input | Expected result |
|---|---|---|---|
| UT-REC-01 | Counts and cell accounting | 40 cells = 30 + 6 + 4 | `1,234` comments; accessible bar label; tooltips 75.0% / 15.0% / 10.0%; "All 40 filled cells are accounted for — nothing was dropped silently." |
| UT-REC-02 | Empty segment | 0 reported cells | 2 bar segments; legend still lists "not imported" |
| UT-REC-03 | Mismatch | Stored count one short | "Accounting mismatch: only 39 of 40 cells are tracked. Don't rely on this import." |

**TreePreview** — `src/components/import/__tests__/tree-preview.test.tsx` (3)
| ID | Test case | Steps | Expected result |
|---|---|---|---|
| UT-TRE-01 | Section and item summaries | Render parsed sections | "1 items · 2 comments", "0 items · 0 comments", "No items" |
| UT-TRE-02 | Comment text on demand | Open a comment; open a plain-text comment | Body only rendered after opening; extras shown; line breaks kept |
| UT-TRE-03 | Links don't leave the wizard | Click a link in a comment | Opens in a new tab with `noopener,noreferrer` |

**ImportWizard** — `src/app/import/__tests__/import-wizard.test.tsx` (10)
| ID | Test case | Steps | Expected result |
|---|---|---|---|
| UT-WIZ-01 | Wrong file explained | Upload `.txt` → server 422 | "That's the plain-text export", server message, "Nothing was imported."; request sent with `mode=preview` |
| UT-WIZ-02 | Not a Spectora export | Server returns found headers | Title plus `Name · Price` |
| UT-WIZ-03 | Too large | Upload a file over 4 MB | "The file is too large"; no request sent |
| UT-WIZ-04 | Network and server errors | Fetch rejects; then non-JSON 502 | "Connection problem"; "unexpected response" |
| UT-WIZ-05 | Preview then commit | Upload → preview → rename → Import | 4 preview sections and skipped-rows banner; commit sends `mode=commit`, trimmed name, **same SHA-256 and file**; navigates to `/templates/t-new?imported=1` |
| UT-WIZ-06 | Duplicate-file warning | Preview with a previous import | "You've imported this exact file before" with a link |
| UT-WIZ-07 | Name required | Clear name, Import | Message shown; no commit request |
| UT-WIZ-08 | Refused commit | Server 409 | "The file changed since the preview"; stays on preview; no navigation |
| UT-WIZ-09 | Start over | "Choose a different file" | Back to the drop zone |
| UT-WIZ-10 | Stale responses ignored | Drop A (slow), drop B, A answers last | B's preview stays on screen |

**Template editor parts** — `src/app/templates/[id]/__tests__/components.test.tsx` (8)
| ID | Test case | Steps | Expected result |
|---|---|---|---|
| UT-EDI-01 | Section sidebar | 10 sections; filter `ING`; filter `zzz` | Active link marked; edge moves disabled; filter → Plumbing, Heating, Cooling with move buttons hidden; "No sections match." |
| UT-EDI-02 | Short sidebar | 3 sections | No filter box; "+ Add section" present |
| UT-EDI-03 | Template header | Rename twice | Report and original links; calls carry version 2, then 3 |
| UT-EDI-04 | Header without import | `importId: null` | No report link; no "Copy of" |
| UT-EDI-05 | Section panel | 2 items, 2 comments; open delete | Counts; "first seen on row 4"; edge moves disabled; dialog states what will be removed |
| UT-EDI-06 | Empty section | No items | "No items in this section yet." and "+ Add item" |
| UT-EDI-07 | Error page | Error with digest; Try again | Reference shown; raw error text hidden; retry called |
| UT-EDI-08 | Not-found page | Render | Heading and "Back to templates" link |

---

## 2. Integration tests (108)

### 2.1 Template server actions — `src/app/templates/__tests__/actions.test.ts` (27)
| ID | Test case | Input / setup | Expected result |
|---|---|---|---|
| IT-ACT-01 (×6) | Input validation before any database access | Bad UUID; blank name; 501-char name; kind `template`; version 0; non-object | `invalid` with message; Supabase client never created |
| IT-ACT-02 | Section rename | Section v2, name with spaces | Update `{name trimmed, version: 3}` filtered by id **and** version 2; template `updated_at` touched; page revalidated |
| IT-ACT-03 | Item rename | Item v1 | Succeeds without revalidating the page |
| IT-ACT-04 | Edit conflict | 0 rows updated; row still exists | `conflict` |
| IT-ACT-05 | Row gone or not yours | 0 rows updated; row not found | `not_found` |
| IT-ACT-06 | Template rename | v7; then 201-char name | One query with version check and `updated_at`; list revalidated; long name `invalid` |
| IT-ACT-07 | Comment HTML sanitised before saving | Body `<p>Hi</p><script>…` | Stored `<p>Hi</p>`; notice mentions script |
| IT-ACT-08 | Clean comment | Plain text with a line break | `notice: null`; rendered `Line one<br>Line two` |
| IT-ACT-09 | Over-long comment | 200,001 characters | `invalid` |
| IT-ACT-10 (×3) | Database error mapping | `23514`, `54000`, `XX000` | `invalid` "That value is too long to save." / `limit` with the database message / `failed` generic (logged) |
| IT-ACT-11 | Add section with position retry | Last position 4; first insert hits a unique clash | Inserts at 5, then 6; returns new id; revalidates |
| IT-ACT-12 | Retry limits | Always clashes; then a permissions error | Gives up after 3 ("Couldn't add — please try again."); other errors stop after 1 insert |
| IT-ACT-13 | Add item | Section found; then not found | Inserts with the section's `template_id` at position 0; missing section → `not_found` |
| IT-ACT-14 | Add comment | Item found (last position 2); then not found | Inserts empty body at position 3; missing item → `not_found` |
| IT-ACT-15 | Delete node | Row deleted; already gone; bad kind | `ok` and revalidate; `not_found`; `invalid` |
| IT-ACT-16 | Move node | Item up | `move_node(item, id, -1)` RPC; revalidate |
| IT-ACT-17 | Move validation and errors | Direction 2; RPC `P0002` | `invalid`; `not_found` |
| IT-ACT-18 | Duplicate template | RPC returns new id | `duplicate_template` called; redirect `/templates/<new>?copied=1` |
| IT-ACT-19 | Duplicate failures | Empty name; `P0002`; `54000` | `invalid`; `not_found`; `limit` with message; no redirect |
| IT-ACT-20 | Delete template | Deleted; none deleted; bad id | Redirect `/templates`; `not_found`; `invalid` |

### 2.2 Authentication actions — `src/app/login/__tests__/actions.test.ts` (12)
| ID | Test case | Input | Expected result |
|---|---|---|---|
| IT-AUTH-01 | Validation before Supabase | Invalid email; 5-character password | Error message plus the entered email (form keeps it); Supabase not called |
| IT-AUTH-02 | No account enumeration | Wrong password | "Email or password is incorrect." |
| IT-AUTH-03 | Returned email capped | 400-character email | 254 characters |
| IT-AUTH-04 (×4) | No open redirects | `next` = `/templates/abc`, `""`, `//evil.example`, `https://evil.example` | Redirects to `/templates/abc`, `/`, `/`, `/` |
| IT-AUTH-05 | Sign-up needing confirmation | No session returned | Confirmation message; `emailRedirectTo` = `<origin>/auth/confirm` |
| IT-AUTH-06 | Sign-up without confirmation | Session returned | Redirect `/` |
| IT-AUTH-07 | Sign-up validation | Short password | Error; Supabase not called |
| IT-AUTH-08 | Sign-up rejected | "User already registered" | That message shown |
| IT-AUTH-09 | Sign out | — | Session ended; redirect `/login` |

### 2.3 Upload API — `src/app/api/import/__tests__/route.test.ts` (12)
| ID | Test case | Request | Expected result |
|---|---|---|---|
| IT-API-01 | Signed out | Valid upload, no session | 401 `unauthenticated` |
| IT-API-02 | Body too large | `content-length` 10 MB | 413, before reading the body |
| IT-API-03 | Malformed requests | Non-multipart body; no file; `mode=delete-everything` | 400 (`no_file` for the missing file) |
| IT-API-04 | Plain-text export | `template.txt` | 422 `stage: file`, `plain_text_export` |
| IT-API-05 | Not a Spectora export | xlsx with `Name`, `Price` | 422 `stage: parse`, `missing_required_columns`, found headers |
| IT-API-06 | Preview writes nothing | Valid xlsx; one earlier import of the same file | 200 with parse result and `previousImports`; only SELECT queries; lookup by SHA-256 |
| IT-API-07 | File changed since preview | Commit with a different SHA-256 | 409 `file_changed` |
| IT-API-08 | Commit | Previewed file, name `"  My template  "` | `import_template` RPC with trimmed name, filename, hash, row count, sections; 200 with ids |
| IT-API-09 | Default name | Commit without a name | Name taken from filename (`Pre-listing 2026`) |
| IT-API-10 (×2) | Limits | `54000` rate limit; `54000` template limit | 429 `rate_limited`; 429 `quota` |
| IT-API-11 | Database failure | `XX000` with internal detail | 500 `failed`; internal detail not in the response |

### 2.4 Email confirmation — `src/app/auth/confirm/__tests__/route.test.ts` (3)
| ID | Test case | Request | Expected result |
|---|---|---|---|
| IT-CNF-01 | Valid link | `?token_hash=abc&type=email` | Token verified; 307 → `/` |
| IT-CNF-02 | Invalid or expired link | Verification error | 307 → `/login?error=confirm` |
| IT-CNF-03 | Missing parameters | `?type=email` | Supabase not called; → `/login?error=confirm` |

### 2.5 Auth proxy and configuration — `src/__tests__/proxy.test.ts` (5)
| ID | Test case | Request | Expected result |
|---|---|---|---|
| IT-PRX-01 | Signed-out page request | `/templates/123` | 307 → `/login?next=%2Ftemplates%2F123` |
| IT-PRX-02 | Signed-out API request | `/api/import` | 401 JSON, not an HTML redirect |
| IT-PRX-03 | Allowed through | `/login`, `/auth/confirm` signed out; `/templates` signed in | Passed through |
| IT-PRX-04 | Session refresh | Supabase refreshes the cookie | Refreshed cookie set on the response |
| IT-PRX-05 | Missing configuration | No Supabase URL | Error telling you to copy `.env.example` |

### 2.6 Database queries — `src/lib/templates/__tests__/queries.test.ts` (12)
| ID | Test case | Setup | Expected result |
|---|---|---|---|
| IT-QRY-01 | Template list | Two rows, one with missing counts | Counts mapped (missing → 0); newest first |
| IT-QRY-02 | List errors surface | Database error | Throws; doesn't show an empty list |
| IT-QRY-03 | Most recent template | Row; no rows | Id; `null` |
| IT-QRY-04 | Malformed template id | `../../etc` | `null`; no query |
| IT-QRY-05 | Template not visible | No row | `null` |
| IT-QRY-06 | Template detail | Copy with sections | Sections by position with item counts; original's name |
| IT-QRY-07 | Section content | Items with plain and unsafe HTML comments | Filters on template **and** section; items and comments ordered; `<br>` line breaks; `onerror` image stripped |
| IT-QRY-08 | Malformed section id | `nope` | `null` |
| IT-QRY-09 | Comment rendering | Link; `onclick` | Safe link attributes; handler stripped |
| IT-QRY-10 | Large import report | 2,500 issues | Fetched in pages 0–999, 1000–1999, 2000–2999; row issues linked to comments, file issues not |
| IT-QRY-11 | Report viewed from a copy | Import belongs to another template | Original template named |
| IT-QRY-12 | No report or error | No import; bad id; timeout | `null`; `null`; rethrows |

### 2.7 Supabase clients — `src/lib/supabase/__tests__/clients.test.ts` (3)
| ID | Test case | Expected result |
|---|---|---|
| IT-CLI-01 | Browser client | Uses only the public URL and anon key |
| IT-CLI-02 | Server client cookies | Reads the request's cookies and writes updates |
| IT-CLI-03 | Read-only cookies | Writing cookies during a Server Component render doesn't throw |

### 2.8 Pages — `src/app/__tests__/pages.test.tsx` (8), `src/app/templates/[id]/__tests__/page.test.tsx` (5), `src/app/templates/[id]/report/__tests__/page.test.tsx` (5)
| ID | Test case | Setup / steps | Expected result |
|---|---|---|---|
| IT-PAG-01 | Home | Latest template exists; none | Redirect `/templates/t1`; `/templates` |
| IT-PAG-02 | Template list | Original and copy | Links, "21 sections · 1,234 comments", "Copy" badge only on the copy, Duplicate buttons, import link |
| IT-PAG-03 | Empty template list | No templates | "No templates yet" with import link |
| IT-PAG-04 | Import page | Render | Heading; warns against the plain-text export; hosts the wizard |
| IT-PAG-05 | App header | Render | Templates and Import links; Sign out |
| IT-PAG-06 | Login with expired link | `?error=confirm` | Alert about an invalid or expired link |
| IT-PAG-07 | Login mode switch | Toggle to sign-up | Hidden mode signin → signup; `next` carried; password autocomplete changes |
| IT-PAG-08 | Login submit | Wrong password; retry | Error alert; **email still filled**; retry shows the confirmation status |
| IT-PAG-09 | Editor page with banners | `?section=s2&imported=1&copied=1` | Loads section s2; imported and copy banners; report link; Garage marked current; empty-section message; original link |
| IT-PAG-10 | Unknown section id | `?section=not-a-section` | First section loaded and rendered |
| IT-PAG-11 | Template with no sections | No sections | Message; no content query; add-section button |
| IT-PAG-12 | Missing template | `getTemplate` → null | 404 |
| IT-PAG-13 | Tab title | Found; missing | `InterNACHI Residential · Template Importer`; `Template not found` |
| IT-PAG-14 | Import report | Report with stats and an issue | Filename, SHA-256, row count, accounted-for status, "Open in editor" link, columns table, category legend |
| IT-PAG-15 | Report on a copy | Original exists | "This template is a copy" with a link to the original |
| IT-PAG-16 | Original deleted | Original is null | "…that template has since been deleted" |
| IT-PAG-17 | Report on the original, no stats | No copy; empty summary | No copy banner; no reconciliation; sheet "—" |
| IT-PAG-18 | No report / missing template | No report; template null | "No import report for this template"; 404 |

### 2.9 Database — real migration in PGlite — `supabase/tests/schema.test.ts` (14), `supabase/tests/pipeline.test.ts` (2)
| ID | Test case | Steps | Expected result |
|---|---|---|---|
| IT-DB-01 | Import stores the hierarchy in order | `import_template` with 2 sections | Exact rows in order, including an item with no comments |
| IT-DB-02 | Import record | Import with 1 issue | `imports` row, issue persisted, `templates.import_id` linked |
| IT-DB-03 | Atomic import | Tree with one section whose name is null | Error; template count unchanged (nothing half-written) |
| IT-DB-04 | Empty template rejected | `[]` sections | "template has no sections" |
| IT-DB-05 | Anonymous callers blocked | `duplicate_template` as `anon` | Permission denied |
| IT-DB-06 | Import rate limit | 30 imports in the last hour, then 1 more | Rejected: rate limit |
| IT-DB-07 | Copy independence | Duplicate; edit the copy's section, item and comments; delete an item; delete the original | Copy equals original at first; original unchanged by edits; copy survives the original's deletion |
| IT-DB-08 | Can't copy others' templates | Bob copies Alice's template | "template not found" |
| IT-DB-09 | Template quota | 200 templates, then import | Rejected: template limit |
| IT-DB-10 | Row-level security (read) | Bob reads Alice's template, comments, issues | 0 rows each |
| IT-DB-11 | Row-level security (write) | Bob inserts a section and updates sections | Insert rejected by RLS; update affects 0 rows |
| IT-DB-12 | Cross-template reference blocked | Item in template B pointing at a section in A | Foreign-key violation |
| IT-DB-13 | Reordering | Move Exterior up twice | Swapped once; the second move is a no-op at the edge |
| IT-DB-14 | Unsafe move input | Kind `templates; drop table x` | "unknown kind" |
| IT-DB-15 | **End-to-end preservation (no browser)** | Real xlsx → parser → `import_template` → read back; duplicate; edit the copy | Stored tree **equals parser output** field for field (colour span, extras, empty item, escaped text); all issues persisted; copy identical; original still equals parser output after editing the copy |
| IT-DB-16 | Optimistic concurrency | Two updates with the same expected version | 1 row, then 0 rows |

---

## 3. End-to-end tests — `e2e/workflow.spec.ts` (5, Playwright) ⏳ written, not yet run
**Preconditions:**
- The app is running (locally or deployed) against a Supabase project with the migration applied.
- A confirmed test account, provided as `E2E_EMAIL` / `E2E_PASSWORD`.

**Behaviour:**
- Tests run in order in one signed-in browser.
- The test spreadsheet is generated inside the test, so it doesn't depend on the committed fixture.
- Every template created is deleted afterwards.
- Without credentials, the whole file is skipped.

| ID | Test case | Steps | Expected result |
|---|---|---|---|
| E2E-01 | Bad files rejected, nothing imported | Upload `template.txt`; then upload `prices.xlsx` (headers Name/Price) | "That's the plain-text export" and "Nothing was imported."; "This doesn't look like a Spectora template export" |
| E2E-02 | Preview, then import | Upload a generated export with a red `span`, an image and a line break; check preview; rename; Import template | "Preview — nothing saved yet"; "…filled cells are accounted for"; image removal listed; URL `/templates/<uuid>?imported=1`; "Template imported"; red text renders `rgb(255, 0, 0)` |
| E2E-03 | Edits persist | Rename section Roof → "Roof (checked)"; edit the Asphalt comment in HTML mode → Save; reload | Sidebar shows the new name; edited text shown; **both still there after reload** |
| E2E-04 | Copy is independent | Duplicate as "… copy"; edit the copy's Asphalt comment; open the original | Copy banner; copy starts with the edited text; copy change shown; **original still shows "Edited by e2e" and not the copy's text** |
| E2E-05 | Import report | Open `/report`; filter "Review"; click "Open in editor" | Report heading and accounted-for status; lands on `?section=<uuid>#item-<uuid>` |

---

## 4. Pending checks (need the real export or the deployment)
| ID | Check | Steps | Pass criteria | Status |
|---|---|---|---|---|
| MAN-01 | Real export preserved | `npm run verify:export -- fixtures/<InterNACHI export>` | Exit 0: conservation balanced, 0 mismatches, 0 unaccounted rows | ⏳ waiting for export |
| MAN-02 | Real export column mapping | Compare the printed column table with `docs/spectora-export-format.md` | Every Spectora column recognised; unknown ones understood and documented | ⏳ waiting for export |
| MAN-03 | Spot-check against Spectora | Import in the app; compare 3 sections (names, order, comment text, links, bold/colour) with Spectora | Identical, apart from changes listed in the report | ⏳ |
| MAN-04 | Seeded deployment | `npm run seed`; open the live URL; sign in as the demo user | Opens straight on the imported template | ⏳ waiting for Supabase + deploy |
| MAN-05 | E2E on the deployment | `E2E_BASE_URL=… npm run test:e2e` | E2E-01 to 05 pass | ⏳ |
| MAN-06 | A second export in the same format | Import another Spectora HTML-text export, if one is available | Imports; report explains any differences | ⏳ optional |

---

## 5. Requirement → test traceability
| Brief requirement | Covered by |
|---|---|
| Import preserves text, hierarchy and order | UT-PAR-01…09, UT-PAR-16, UT-VER-01…04, IT-DB-01, IT-DB-15, E2E-02, MAN-01, MAN-03 |
| Skipped/unsupported content visible, not dropped or rewritten | UT-PAR-10…15, UT-SAN-04…08, UT-SAN-12, UT-ISS-01…03, UT-REC-01…03, IT-PAG-14, E2E-02, E2E-05 |
| Edit section, item and comment text, and save | UT-EDT-01…07, UT-NOD-01, UT-CMT-04…11, UT-RTE-01…05, IT-ACT-02…10, IT-DB-16, E2E-03 |
| Copy is independent of the original | IT-ACT-18…19, IT-DB-07, IT-DB-15, UT-TPL-01, E2E-04 |
| Stored in a real backend, still there after reopening | IT-DB-01…16, IT-QRY-01…12, E2E-03 (reload) |
| Structured, explainable schema (no opaque blob) | IT-DB-01, IT-DB-12, IT-DB-15 |
| Formatting, links and rich content | UT-SAN-01…14, UT-EDC-01…02, UT-CMT-04…07, UT-RTE-02…04, IT-QRY-07, IT-QRY-09, E2E-02 |
| At least one failure case handled | UT-FIL-02…06, UT-PAR-17…21, UT-WIZ-01…04, UT-WIZ-07…08, IT-API-01…05, IT-API-07, IT-API-10…11, IT-DB-03, E2E-01 |
| Security (access control, input handling) | IT-DB-05, IT-DB-08, IT-DB-10…12, IT-DB-14, IT-AUTH-01…04, IT-PRX-01…02, IT-ACT-01, IT-API-11, UT-SAN-04…08, UT-SAN-14 |

## 6. Defects found by these tests (fixed)
| Found by | Defect | Fix |
|---|---|---|
| UT-COM-01 (and lint) | `safeFilename` stripped spaces and punctuation from filenames | Filter by character code, not a regex range |
| UT-EDT-07 | Enter then blur could save twice, producing a false "changed elsewhere" conflict | Only one save can be in flight at a time |
| IT-PAG-08 | A failed sign-in cleared the email field (React 19 resets forms after an action) | Action returns the email; field is pre-filled from it |
| UT-RTE-02 | Visual editor stored a trailing empty `<p></p>` after lists | Trailing empty paragraphs stripped from editor output |
| UT-VER-01 (while writing it) | — (the test itself was wrong about fill-down; the parser was right) | Test corrected |
