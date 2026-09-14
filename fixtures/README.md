# Spectora export fixture

Place `InterNACHI Residential.xlsx` in this directory. It must be the spreadsheet downloaded from
Spectora's **Export to spreadsheet → Export HTML Text** action, not the plain-text export.

- Template: **InterNACHI Residential**
- Source: Spectora Template Center, published by Spectora; added to a free-trial account
- Spectora template ID: `334635`
- Export date: 2026-09-14
- Content: shareable sample material, no real customer information

Run `npm run verify:export -- 'fixtures/InterNACHI Residential.xlsx'` to check preservation row by row.
