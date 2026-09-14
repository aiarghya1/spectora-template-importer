import type { ParseStats } from "@/lib/import/types";
import { formatNumber } from "../ui";

/**
 * "Did everything come across?" — headline counts plus a single part-to-whole bar showing where
 * every non-empty cell in the file went. Colours are categorical slots 1–3 of the dataviz reference
 * palette, validated all-pairs for colour-vision deficiency on a white surface. Identity never relies
 * on colour alone: the legend carries labels and exact numbers.
 */
const SEGMENTS = [
  {
    key: "cellsStored",
    label: "Imported into editable fields",
    help: "Section and item names, comment names, comment text and type.",
    color: "#2a78d6",
  },
  {
    key: "cellsInExtras",
    label: "Kept as read-only data",
    help: "Other Spectora columns, stored on each comment exactly as they were.",
    color: "#eb6834",
  },
  {
    key: "cellsReported",
    label: "Not imported — listed as issues",
    help: "Skipped rows and content above the header, with their original values.",
    color: "#1baf7a",
  },
] as const;

export function Reconciliation({ stats }: { stats: ParseStats }) {
  const total = stats.nonEmptyCells;
  const accounted = stats.cellsStored + stats.cellsInExtras + stats.cellsReported;
  const balanced = accounted === total;
  const percent = (value: number) => (total === 0 ? 0 : (value / total) * 100);
  const summary = SEGMENTS.map((s) => `${s.label}: ${formatNumber(stats[s.key])}`).join("; ");

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <dl className="grid max-w-md grid-cols-3 gap-4">
        {(
          [
            ["Sections", stats.sections],
            ["Items", stats.items],
            ["Comments", stats.comments],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className="text-2xl font-semibold text-zinc-900">{formatNumber(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-zinc-500">
        From {formatNumber(stats.dataRows)} template rows (headers on row {stats.headerRow}) · {formatNumber(stats.blankRows)} blank rows
        ignored · {formatNumber(stats.skippedRows)} rows skipped
      </p>

      <h3 className="mt-6 text-sm font-medium text-zinc-800">
        Where each of the {formatNumber(total)} filled cells in the file went
      </h3>
      <div role="img" aria-label={`${formatNumber(total)} filled cells. ${summary}.`} className="mt-2 flex h-6 w-full items-center gap-[2px]">
        {SEGMENTS.filter((s) => stats[s.key] > 0).map((s) => (
          <div
            key={s.key}
            className="group relative flex h-full min-w-[3px] items-center"
            style={{ flexGrow: stats[s.key], flexBasis: 0 }}
          >
            <div className="h-3 w-full group-first:rounded-l group-last:rounded-r" style={{ backgroundColor: s.color }} />
            <div
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max max-w-64 -translate-x-1/2 rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow group-hover:block"
            >
              {s.label}: {formatNumber(stats[s.key])} ({percent(stats[s.key]).toFixed(1)}%)
            </div>
          </div>
        ))}
      </div>

      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {SEGMENTS.map((s) => (
          <li key={s.key} className="flex gap-2">
            <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <div>
              <p className="text-sm text-zinc-800">
                <span className="font-semibold tabular-nums">{formatNumber(stats[s.key])}</span> {s.label.toLowerCase()}
              </p>
              <p className="text-xs text-zinc-500">{s.help}</p>
            </div>
          </li>
        ))}
      </ul>

      <p role="status" className={`mt-5 flex items-start gap-2 text-sm font-medium ${balanced ? "text-[#006300]" : "text-red-700"}`}>
        <span aria-hidden>{balanced ? "✓" : "✕"}</span>
        {balanced
          ? `All ${formatNumber(total)} filled cells are accounted for — nothing was dropped silently.`
          : `Accounting mismatch: only ${formatNumber(accounted)} of ${formatNumber(total)} cells are tracked. Don't rely on this import.`}
      </p>
    </div>
  );
}
