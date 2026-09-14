# Import invariants

Rules every importer change must keep. Tests in `src/lib/import/__tests__` enforce them.
Read this before touching anything under `src/lib/import/`.

1. **Conservation.** Every non-empty source cell ends up either in a stored field, in an entity's
   `extras`, or in an `import_issues` row. `stored + extras + reported == non-empty source cells`.
2. **Order.** Section, item and comment order equals first-appearance order in the source rows.
3. **Text fidelity.** Text is stored verbatim except: HTML sanitisation (each change reported),
   and line-ending normalisation (CRLF → LF). No trimming inside values, no case changes, no dedupe.
4. **Traceability.** Every section/item/comment records `source_row` (1-based spreadsheet row).
5. **Atomicity.** A commit writes the whole template or nothing (single RPC transaction).
6. **No silent fallback.** Unrecognised files, missing required columns, or empty templates fail
   with a user-readable error. Never import a partial guess.
7. **Missing vs unsupported.** Issues are tagged `missing_in_export` (data not present in the file)
   or `unsupported` (present but not modelled), never mixed.
8. **Determinism.** Same file bytes ⇒ identical parse result (checked via sha256 + snapshot).
