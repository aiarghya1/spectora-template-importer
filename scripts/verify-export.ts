/**
 * Check a Spectora export end to end without a database:
 *   file checks → parse → conservation totals → independent row-by-row preservation check.
 * Usage: npm run verify:export [-- path/to/export.xlsx]
 * Exits non-zero if anything is unaccounted for or changed.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { prepareImport } from "../src/lib/import/commit";
import { checkUpload } from "../src/lib/import/file-check";
import { verifyPreservation } from "../src/lib/import/verify";
import { fail, resolveExportPath } from "./lib";

const path = resolveExportPath(process.argv[2]);
const bytes = new Uint8Array(readFileSync(path));
const check = checkUpload(basename(path), bytes);
if (!check.ok) fail(`${check.code}: ${check.message}`);

const prepared = prepareImport(basename(path), bytes);
if (!prepared.ok) fail(`${prepared.code}: ${prepared.message} ${JSON.stringify(prepared.detail ?? {})}`);

const { parse } = prepared;
const { stats } = parse;
console.log(`File       ${path}`);
console.log(`SHA-256    ${prepared.sha256}`);
console.log(`Sheet      "${parse.sheetName}", headers on row ${stats.headerRow}`);
console.log(`Structure  ${stats.sections} sections · ${stats.items} items · ${stats.comments} comments`);
console.log(`Rows       ${stats.dataRows} data · ${stats.blankRows} blank · ${stats.skippedRows} skipped · ${stats.itemOnlyRows} item-only · ${stats.sectionOnlyRows} section-only`);
console.log("");
console.log("Columns");
for (const c of parse.columns.filter((c) => c.header || c.values)) {
  console.log(`  ${c.letter.padEnd(3)} ${(c.header || "(no header)").padEnd(28)} → ${c.role.padEnd(7)} ${String(c.values).padStart(6)} values`);
}

const accounted = stats.cellsStored + stats.cellsInExtras + stats.cellsReported;
console.log("");
console.log(`Cells      ${stats.nonEmptyCells} filled = ${stats.cellsStored} stored + ${stats.cellsInExtras} read-only + ${stats.cellsReported} reported`);

const byCode = new Map<string, number>();
for (const issue of parse.issues) byCode.set(`${issue.severity}/${issue.code}`, (byCode.get(`${issue.severity}/${issue.code}`) ?? 0) + 1);
console.log("");
console.log("Issues");
for (const [code, count] of [...byCode].sort()) console.log(`  ${String(count).padStart(5)}  ${code}`);

const report = verifyPreservation(bytes, check.kind, parse);
console.log("");
console.log(
  `Preservation  ${report.commentRowsChecked} comment rows and ${report.structureRowsChecked} structure rows re-checked against the file; ${report.reportedRows} reported rows`,
);

let failed = false;
if (accounted !== stats.nonEmptyCells) {
  console.error(`✕ Conservation broken: ${accounted} of ${stats.nonEmptyCells} cells accounted for`);
  failed = true;
}
if (report.unaccountedRows.length) {
  console.error(`✕ Rows not found in the result: ${report.unaccountedRows.slice(0, 50).join(", ")}`);
  failed = true;
}
if (report.mismatches.length) {
  console.error(`✕ ${report.mismatches.length} mismatch(es):`);
  for (const m of report.mismatches.slice(0, 20)) {
    console.error(`  row ${m.row} ${m.field}: expected ${JSON.stringify(m.expected.slice(0, 120))} got ${JSON.stringify(m.actual.slice(0, 120))}`);
  }
  failed = true;
}
if (failed) process.exit(1);
console.log("✓ Every filled cell is accounted for and every row matches the file.");
