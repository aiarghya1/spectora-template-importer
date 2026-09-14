/** Test helper: build a real .xlsx in memory from rows. Reuse in any importer test. */
import * as XLSX from "xlsx";

export const SPECTORA_HEADERS = [
  "Section Name",
  "Item Name",
  "Comment Name",
  "Comment Text",
  "Comment Type",
  "Category",
  "Order (w/i item)",
];

export function buildXlsx(rows: unknown[][], extraSheets: Record<string, unknown[][]> = {}): Uint8Array {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Template");
  for (const [name, sheetRows] of Object.entries(extraSheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheetRows), name);
  }
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
