import { ROLE_LABEL } from "@/lib/import/labels";
import type { ColumnSummary } from "@/lib/import/types";
import { formatNumber } from "../ui";

/** How each spreadsheet column was interpreted. */
export function ColumnTable({ columns }: { columns: ColumnSummary[] }) {
  const visible = columns.filter((c) => c.header || c.values > 0);
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-600">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Col</th>
            <th scope="col" className="px-3 py-2 font-medium">Header in file</th>
            <th scope="col" className="px-3 py-2 font-medium">Imported as</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Values</th>
            <th scope="col" className="px-3 py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {visible.map((column) => (
            <tr key={column.letter}>
              <td className="px-3 py-2 font-mono text-xs text-zinc-500">{column.letter}</td>
              <td className="px-3 py-2">{column.header || <span className="italic text-zinc-400">(no header)</span>}</td>
              <td className="px-3 py-2">
                <span className={column.role === "extras" ? (column.known ? "text-zinc-600" : "text-amber-800") : "font-medium text-zinc-900"}>
                  {column.role === "extras" && !column.known ? "Unrecognised · kept as data" : ROLE_LABEL[column.role]}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{formatNumber(column.values)}</td>
              <td className="px-3 py-2 text-xs text-zinc-500">{column.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
