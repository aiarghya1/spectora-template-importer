# Real Spectora export audit

**Source:** Spectora Template Center, *InterNACHI Residential*, template ID `334635`, exported through
**Export to spreadsheet → Export HTML Text** on 2026-09-14 from a trial account. The committed workbook is
[`../fixtures/InterNACHI Residential.xlsx`](../fixtures/InterNACHI%20Residential.xlsx). It contains shareable
sample content, not customer inspection data. SHA-256:
`a79bec603c6d5a0382f5e9e0ffe613162fd5eb636c05f85574376b65f7265d6d`.

## Workbook to parser

`npm run verify:export -- 'fixtures/InterNACHI Residential.xlsx'` independently re-reads the first sheet and
checks every nonempty row against the parsed hierarchy, including source row, section and item membership,
comment title, type, visible text, allowed HTML, read-only extras, and order. It rejects missing, invented, or
duplicated source rows. Result:

| Check | Result |
|---|---:|
| Data rows / comments checked | 392 / 392 |
| Sections / items | 13 / 69 |
| Skipped / unaccounted rows | 0 / 0 |
| Row or field mismatches | 0 |
| Filled cells | 4,611 = 1,877 stored + 2,734 read-only + 0 reported |
| Unknown columns | 0 of 42 |
| Warning / error issues | 0 / 0 |

The real file exposed an annotated `Comment Type (info, limit, defect)` header. It is now mapped to the
editable type field; all 392 values are retained. Its other annotated Spectora headers are recognised and
kept as read-only extras. Of the 392 comments, 83 have no source body text but retain their titles, types,
and extras. The 39 reported HTML changes remove link attributes or unsupported layout styles; no text,
links, or allowed emphasis was lost.

## Parser to database

`npm run verify:seeded -- 'fixtures/InterNACHI Residential.xlsx'` signs in as the demo user and compares every
saved section, item, and comment with the parsed file. It checks names, titles, HTML, types, extras, source
rows, parent relationships, and positions; it pages database reads instead of relying on Supabase's default
row limit. The seeded template `444a78a3-0861-4f0a-aae6-60189dc1416d` passed: **13 sections, 69 items,
392 comments, no differences**.

## Repeated-name boundary

This particular export has **no repeated section or item runs**, so it cannot itself demonstrate the case.
Generated regression files prove that non-contiguous repeated names and explicit adjacent section/item
declarations remain separate and in spreadsheet order; the verifier rejects deliberately merged runs.
If an export puts two distinct adjacent groups under the same name with no boundary marker or stable ID,
the spreadsheet alone cannot distinguish them. Such a case needs a comparison with the source template in
Spectora; this limitation is not hidden by a passing row check.
