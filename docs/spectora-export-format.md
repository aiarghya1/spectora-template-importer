# Spectora template export format

> **Status:** derived from Spectora's published import spec. **Verify against `fixtures/` once the real
> export is committed** and update this file with anything that differs.

Sources:
- [How to Export a Template](https://support.spectora.com/en/articles/2769896-how-to-export-a-template) —
  Export to spreadsheet → *Plain Text* (strips links/formatting) or *HTML Text* (keeps them). We accept HTML Text.
- [How to Import a Template from a Spreadsheet](https://support.spectora.com/en/articles/6198400-how-to-import-a-template-from-a-spreadsheet) —
  column list below; "narratives are organized in the order they appear in the spreadsheet within each item".

## Shape
One row per comment (Spectora calls comments "narratives"). Section and item are repeated on every row.
There is no template name, and no section- or item-level settings — only comment rows.

## Columns and how we handle them

| Spectora column | Our handling |
|---|---|
| Section Name | `sections.name` (required) |
| Item Name | `items.name` (required) |
| Comment Name | `comments.title` |
| Comment Text | `comments.body_html` (sanitised, every change reported) |
| Comment Type (info / limit / defect) | `comments.comment_type`, verbatim |
| Category (-1 low, 0 med, 1 high) | extras (read-only) |
| Multiple Choice Options, Unit Type Options, Answer Type, Default Value, Default Value 2, Default Unit Type | extras — information-field settings |
| Recommendation, Default Location, Default Estimate Min/Max | extras |
| Order (w/i item) | extras; **row order wins**, disagreement is reported |
| Locked, Simple Format, Disable Photos, Uses | extras |
| Default Photo 1–3 (+ Caption) | extras — URLs kept as text, images not fetched |
| Last Modified | extras |
| anything else | extras + `unknown_column_preserved` warning |

Header matching ignores case, spaces and punctuation (`normalizeHeader` in `src/lib/import/columns.ts`).
The header row may be preceded by up to 19 rows (e.g. a title), which are reported, not imported.

## Missing from the export vs unsupported by us
- **Missing in export** (we can't recover it): template name, section/item settings, report layout,
  uploaded photos (only default-photo URLs appear), comments with no text.
- **Unsupported by this importer** (present, preserved as read-only extras, not editable): every column
  in the "extras" rows above; inline `<img>`/video embeds (removed, URL reported); non-allowlisted HTML/CSS.
