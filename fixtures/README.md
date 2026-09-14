# Spectora export fixture

`InterNACHI Residential.xlsx` is the supplied Spectora **Export to spreadsheet → Export HTML Text**
workbook. Keep this file unchanged so its SHA-256 fingerprint remains an auditable source reference.

- Template: **InterNACHI Residential**
- Source: Spectora Template Center, published by Spectora; added to a free-trial account
- Spectora template ID: `334635`
- Export date: 2026-09-14
- Content: shareable sample material, no real customer information
- SHA-256: `a79bec603c6d5a0382f5e9e0ffe613162fd5eb636c05f85574376b65f7265d6d`
- First sheet: `Sheet1`, 42 columns, 392 data rows
- Verified import shape: 13 sections, 69 items, 392 comments; no skipped rows or unknown columns

Run `npm run verify:export -- 'fixtures/InterNACHI Residential.xlsx'` to re-check preservation row by row.
