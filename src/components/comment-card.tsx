"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { updateComment } from "@/app/templates/actions";
import { needsHtmlMode, toEditorHtml } from "@/lib/html/editor-compat";
import type { CommentView } from "@/lib/templates/types";
import { DeleteNodeButton, MoveButtons } from "./node-controls";
import { RichEditor } from "./rich-editor";
import { Badge, Banner, Button, commentTypeStyle } from "./ui";

type Saved = Pick<CommentView, "title" | "bodyHtml" | "renderedHtml" | "version">;

export function CommentCard({ comment, isFirst, isLast }: { comment: CommentView; isFirst: boolean; isLast: boolean }) {
  const [data, setData] = useState<Saved>({
    title: comment.title,
    bodyHtml: comment.bodyHtml,
    renderedHtml: comment.renderedHtml,
    version: comment.version,
  });
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const extras = Object.entries(comment.extras);
  const displayTitle = data.title.trim() ? data.title : "Untitled comment";

  return (
    <article id={`comment-${comment.id}`} className="scroll-mt-24 rounded-lg border border-zinc-200 bg-white">
      {editing ? (
        <CommentEditor
          id={comment.id}
          version={data.version}
          title={data.title}
          bodyHtml={data.bodyHtml}
          onCancel={() => setEditing(false)}
          onSaved={(next, sanitizeNotice) => {
            setData(next);
            setNotice(sanitizeNotice);
            setJustSaved(true);
            setEditing(false);
          }}
        />
      ) : (
        <div className="p-4">
          <div className="flex flex-wrap items-start gap-2">
            <h4 className={`min-w-0 font-medium ${data.title.trim() ? "text-zinc-900" : "italic text-zinc-400"}`}>{displayTitle}</h4>
            {comment.commentType && <Badge className={commentTypeStyle(comment.commentType)}>{comment.commentType}</Badge>}
            {justSaved && <span className="text-xs text-emerald-700">Saved</span>}
            <div className="ml-auto flex items-center gap-1">
              {comment.sourceRow !== null && (
                <span className="mr-1 text-xs text-zinc-400" title="Row in the imported spreadsheet">
                  Row {comment.sourceRow}
                </span>
              )}
              <MoveButtons kind="comment" id={comment.id} label={displayTitle} isFirst={isFirst} isLast={isLast} />
              <Button
                size="sm"
                onClick={() => {
                  setNotice(null);
                  setJustSaved(false);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
              <DeleteNodeButton
                kind="comment"
                id={comment.id}
                label={displayTitle}
                description={`"${displayTitle}" will be removed from this template. Other templates, including copies, are not affected.`}
              />
            </div>
          </div>

          {data.bodyHtml.trim() ? (
            <div className="rich mt-2 text-sm leading-relaxed text-zinc-700" dangerouslySetInnerHTML={{ __html: data.renderedHtml }} />
          ) : (
            <p className="mt-2 text-sm italic text-zinc-400">No comment text</p>
          )}

          {notice && (
            <div className="mt-3">
              <Banner tone="warning" title="Saved, with safety changes">
                {notice}
              </Banner>
            </div>
          )}

          {extras.length > 0 && (
            <div className="mt-3">
              <button type="button" onClick={() => setShowExtras((v) => !v)} aria-expanded={showExtras} className="text-xs text-zinc-500 underline hover:text-zinc-800">
                {showExtras ? "Hide" : "Show"} other Spectora fields ({extras.length})
              </button>
              {showExtras && (
                <div className="mt-2 rounded-md bg-zinc-50 p-3">
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
                    {extras.map(([key, value]) => (
                      <Fragment key={key}>
                        <dt className="font-medium text-zinc-600">{key}</dt>
                        <dd className="whitespace-pre-wrap break-words text-zinc-800">{value}</dd>
                      </Fragment>
                    ))}
                  </dl>
                  <p className="mt-2 text-xs text-zinc-500">Preserved exactly as imported. Not editable in this app.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function CommentEditor({
  id,
  version,
  title,
  bodyHtml,
  onCancel,
  onSaved,
}: {
  id: string;
  version: number;
  title: string;
  bodyHtml: string;
  onCancel: () => void;
  onSaved: (next: Saved, notice: string | null) => void;
}) {
  const router = useRouter();
  const lossy = useMemo(() => needsHtmlMode(bodyHtml), [bodyHtml]);
  const [mode, setMode] = useState<"rich" | "html">(lossy ? "html" : "rich");
  const [draftTitle, setDraftTitle] = useState(title);
  const [html, setHtml] = useState(bodyHtml);
  const [edited, setEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!edited) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edited]);

  async function save() {
    if (!edited || saving) return;
    setSaving(true);
    setError(null);
    const result = await updateComment({ id, version, title: draftTitle, bodyHtml: html });
    setSaving(false);
    if (result.ok) {
      onSaved({ title: draftTitle, bodyHtml: result.bodyHtml, renderedHtml: result.renderedHtml, version: result.version }, result.notice);
    } else {
      setError({ message: result.message, conflict: result.code === "conflict" });
    }
  }

  function cancel() {
    if (edited && !window.confirm("Discard your unsaved changes to this comment?")) return;
    onCancel();
  }

  function switchMode(next: "rich" | "html") {
    if (next === mode) return;
    if (
      next === "rich" &&
      needsHtmlMode(html) &&
      !window.confirm(
        "The visual editor can't keep some of this comment's formatting (such as colours, tables or layout). If you edit and save in visual mode, that formatting will be removed. Switch anyway?",
      )
    ) {
      return;
    }
    setMode(next);
  }

  return (
    <div
      className="p-4"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <label className="block text-xs font-medium text-zinc-600">
        Comment name
        <input
          value={draftTitle}
          maxLength={1000}
          onChange={(e) => {
            setDraftTitle(e.target.value);
            setEdited(true);
          }}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-normal text-zinc-900"
        />
      </label>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-600">Comment text</span>
        <div role="tablist" aria-label="Editor mode" className="inline-flex rounded-md border border-zinc-200 p-0.5 text-xs">
          {(["rich", "html"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`rounded px-2 py-1 ${mode === m ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {m === "rich" ? "Visual" : "HTML"}
            </button>
          ))}
        </div>
      </div>

      {lossy && mode === "html" && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This comment uses formatting the visual editor can&apos;t keep (like colours or tables), so it opened in HTML mode to protect it.
        </p>
      )}

      <div className="mt-2 rounded-md border border-zinc-300 bg-white focus-within:border-zinc-600">
        {mode === "rich" ? (
          <RichEditor
            initialHtml={toEditorHtml(html)}
            onChange={(next) => {
              setHtml(next);
              setEdited(true);
            }}
          />
        ) : (
          <textarea
            aria-label="Comment HTML"
            value={html}
            spellCheck={false}
            rows={Math.min(20, Math.max(6, html.split("\n").length + 1))}
            onChange={(e) => {
              setHtml(e.target.value);
              setEdited(true);
            }}
            className="block w-full resize-y rounded-md px-3 py-2 font-mono text-xs focus:outline-none"
          />
        )}
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error.message}
          {error.conflict && (
            <button type="button" className="ml-2 font-medium underline" onClick={() => router.refresh()}>
              Reload latest
            </button>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" onClick={() => void save()} disabled={!edited || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button onClick={cancel} disabled={saving}>
          Cancel
        </Button>
        <span className="ml-auto text-xs text-zinc-500">{edited ? "Unsaved changes · ⌘/Ctrl+S to save" : "No changes yet"}</span>
      </div>
    </div>
  );
}
