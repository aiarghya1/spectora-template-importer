"use client";

import Link from "next/link";
import { useState } from "react";
import { AddSectionForm, MoveButtons } from "@/components/node-controls";
import type { SectionSummary } from "@/lib/templates/types";

export function SectionSidebar({
  templateId,
  sections,
  activeId,
}: {
  templateId: string;
  sections: SectionSummary[];
  activeId: string | null;
}) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const visible = query ? sections.filter((s) => s.name.toLowerCase().includes(query)) : sections;

  return (
    <nav
      aria-label="Sections"
      className="flex flex-col rounded-xl border border-zinc-200 bg-white lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]"
    >
      <div className="border-b border-zinc-200 p-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Sections</h2>
          <span className="text-xs text-zinc-500">{sections.length}</span>
        </div>
        {sections.length > 8 && (
          <input
            type="search"
            aria-label="Filter sections"
            placeholder="Filter sections"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mt-2 h-8 w-full rounded-md border border-zinc-300 px-2 text-sm"
          />
        )}
      </div>

      <ol className="flex-1 overflow-y-auto p-2">
        {visible.map((section) => {
          const index = sections.indexOf(section);
          const active = section.id === activeId;
          return (
            <li
              key={`${section.id}:${section.version}`}
              className={`group flex items-center rounded-md ${active ? "bg-zinc-900 text-white" : "text-zinc-800 hover:bg-zinc-100"}`}
            >
              <Link
                href={`/templates/${templateId}?section=${section.id}`}
                aria-current={active ? "page" : undefined}
                className="min-w-0 flex-1 truncate px-2 py-1.5 text-sm"
              >
                {section.name}
              </Link>
              <span className={`px-1 text-xs tabular-nums ${active ? "text-zinc-300" : "text-zinc-400"}`}>{section.itemCount}</span>
              {!query && (
                <span className={`hidden group-focus-within:inline-flex group-hover:inline-flex ${active ? "[&_button]:text-zinc-200 [&_button:hover]:text-zinc-900" : ""}`}>
                  <MoveButtons kind="section" id={section.id} label={section.name} isFirst={index === 0} isLast={index === sections.length - 1} />
                </span>
              )}
            </li>
          );
        })}
        {visible.length === 0 && <li className="px-2 py-1.5 text-sm text-zinc-500">No sections match.</li>}
      </ol>

      <div className="border-t border-zinc-200 p-3">
        <AddSectionForm templateId={templateId} />
      </div>
    </nav>
  );
}
