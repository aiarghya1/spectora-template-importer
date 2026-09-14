"use client";

import { useState, type MouseEvent } from "react";
import type { ParsedComment, ParsedSection } from "@/lib/import/types";
import { Badge, commentTypeStyle, formatNumber } from "../ui";

const HAS_TAG = /<[a-z][\s\S]*?>/i;

/** Read-only outline of what will be created. Comment bodies render only when opened (keeps big templates fast). */
export function TreePreview({ sections }: { sections: ParsedSection[] }) {
  return (
    <ol className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
      {sections.map((section, index) => {
        const comments = section.items.reduce((n, i) => n + i.comments.length, 0);
        return (
          <li key={`${index}-${section.name}`}>
            <details>
              <summary className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-zinc-50">
                <span className="font-medium text-zinc-900">{section.name}</span>
                <span className="text-xs text-zinc-500">
                  {formatNumber(section.items.length)} items · {formatNumber(comments)} comments
                </span>
                <span className="ml-auto text-xs text-zinc-400">Row {section.source_row}</span>
              </summary>
              <ul className="space-y-3 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3">
                {section.items.map((item, itemIndex) => (
                  <li key={`${itemIndex}-${item.name}`}>
                    <p className="text-sm font-medium text-zinc-800">
                      {item.name} <span className="font-normal text-zinc-400">· {item.comments.length} comments</span>
                    </p>
                    {item.comments.length > 0 && (
                      <ul className="mt-1 space-y-1 pl-3">
                        {item.comments.map((comment, commentIndex) => (
                          <PreviewComment key={commentIndex} comment={comment} />
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
                {section.items.length === 0 && <li className="text-sm text-zinc-500">No items</li>}
              </ul>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

function PreviewComment({ comment }: { comment: ParsedComment }) {
  const [open, setOpen] = useState(false);
  const extras = Object.entries(comment.extras);

  // Links in the preview open in a new tab so the user never loses an unfinished import.
  const openLinksInNewTab = (event: MouseEvent) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    event.preventDefault();
    window.open(anchor.href, "_blank", "noopener,noreferrer");
  };

  return (
    <li className="rounded-md bg-white ring-1 ring-zinc-200">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm">
        <span className="text-zinc-400">{open ? "▾" : "▸"}</span>
        <span className={comment.title.trim() ? "text-zinc-800" : "italic text-zinc-400"}>{comment.title.trim() || "Untitled comment"}</span>
        {comment.comment_type && <Badge className={commentTypeStyle(comment.comment_type)}>{comment.comment_type}</Badge>}
        <span className="ml-auto text-xs text-zinc-400">Row {comment.source_row}</span>
      </button>
      {open && (
        <div className="border-t border-zinc-100 px-3 py-2">
          {comment.body_html.trim() ? (
            <div
              onClick={openLinksInNewTab}
              className={`rich text-sm text-zinc-700 ${HAS_TAG.test(comment.body_html) ? "" : "whitespace-pre-wrap"}`}
              // body_html was sanitised by the parser with the same allowlist used for rendering.
              dangerouslySetInnerHTML={{ __html: comment.body_html }}
            />
          ) : (
            <p className="text-sm italic text-zinc-400">No comment text</p>
          )}
          {extras.length > 0 && (
            <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs text-zinc-500">
              {extras.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="font-medium">{key}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </li>
  );
}
