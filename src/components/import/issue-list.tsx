"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORY_LABEL, SEVERITY_LABEL, SEVERITY_STYLE } from "@/lib/import/labels";
import type { IssueCategory, Severity } from "@/lib/import/types";
import type { IssueWithLocation } from "@/lib/templates/types";
import { Badge, formatNumber } from "../ui";

const SEVERITIES: Severity[] = ["error", "warning", "info"];
const PAGE = 200;

/** Filterable list of everything the importer skipped, changed or couldn't model. Used in preview and report. */
export function IssueList({ issues, templateId }: { issues: IssueWithLocation[]; templateId?: string }) {
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [category, setCategory] = useState<IssueCategory | "all">("all");
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(() => {
    const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
    const byCategory: Record<IssueCategory, number> = { missing_in_export: 0, unsupported: 0, sanitized: 0, structure: 0 };
    for (const issue of issues) {
      bySeverity[issue.severity]++;
      byCategory[issue.category]++;
    }
    return { bySeverity, byCategory };
  }, [issues]);

  const filtered = issues.filter(
    (i) => (severity === "all" || i.severity === severity) && (category === "all" || i.category === category),
  );

  if (issues.length === 0) {
    return <p className="text-sm text-zinc-600">No issues: every row imported as-is.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={severity === "all"} onClick={() => setSeverity("all")}>
          All ({formatNumber(issues.length)})
        </FilterChip>
        {SEVERITIES.map((s) => (
          <FilterChip key={s} active={severity === s} onClick={() => setSeverity(s)} disabled={counts.bySeverity[s] === 0}>
            {SEVERITY_LABEL[s]} ({formatNumber(counts.bySeverity[s])})
          </FilterChip>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-zinc-600">
          Type
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as IssueCategory | "all")}
            className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-xs"
          >
            <option value="all">All types</option>
            {(Object.keys(CATEGORY_LABEL) as IssueCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c].label} ({counts.byCategory[c]})
              </option>
            ))}
          </select>
        </label>
      </div>

      {category !== "all" && <p className="mt-2 text-xs text-zinc-500">{CATEGORY_LABEL[category].description}</p>}

      <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
        {filtered.slice(0, limit).map((issue, index) => (
          <li key={issue.id ?? index} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={SEVERITY_STYLE[issue.severity]}>{SEVERITY_LABEL[issue.severity]}</Badge>
              <span className="text-xs font-medium text-zinc-500">{issue.source_row !== null ? `Row ${issue.source_row}` : "Whole file"}</span>
              <span className="text-xs text-zinc-400">{CATEGORY_LABEL[issue.category].label}</span>
              {templateId && issue.location && (
                <Link
                  href={`/templates/${templateId}?section=${issue.location.sectionId}#item-${issue.location.itemId}`}
                  className="ml-auto text-xs font-medium text-zinc-700 underline"
                >
                  Open in editor
                </Link>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-800">{issue.message}</p>
            <IssueDetail detail={issue.detail} />
          </li>
        ))}
      </ul>
      {filtered.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="mt-3 text-sm font-medium text-zinc-700 underline">
          Show more ({formatNumber(filtered.length - limit)} remaining)
        </button>
      )}
      {filtered.length === 0 && <p className="mt-3 text-sm text-zinc-500">No issues match these filters.</p>}
    </div>
  );
}

function FilterChip({
  active,
  children,
  ...props
}: { active: boolean; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`h-8 rounded-full px-3 text-xs font-medium disabled:opacity-40 ${active ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50"}`}
      {...props}
    >
      {children}
    </button>
  );
}

function IssueDetail({ detail }: { detail: Record<string, unknown> }) {
  const values = detail.values;
  const rows = detail.rows;
  if (values && typeof values === "object") {
    const entries = Array.isArray(values) ? values.map((v, i) => [`Cell ${i + 1}`, v] as const) : Object.entries(values);
    if (entries.length === 0) return null;
    return (
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-zinc-500">Show the row&apos;s original values</summary>
        <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded-md bg-zinc-50 p-3 text-xs">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="font-medium text-zinc-600">{key}</dt>
              <dd className="whitespace-pre-wrap break-words text-zinc-800">{String(value)}</dd>
            </div>
          ))}
        </dl>
      </details>
    );
  }
  if (Array.isArray(rows) && rows.length > 0) {
    const count = typeof detail.count === "number" ? detail.count : rows.length;
    return (
      <p className="mt-1 text-xs text-zinc-500">
        Rows: {rows.slice(0, 30).join(", ")}
        {count > 30 && ` … and ${formatNumber(count - 30)} more`}
      </p>
    );
  }
  return null;
}
