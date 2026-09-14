"use client";

import { useRef, useState } from "react";

type SaveResult = { ok: true } | { ok: false; message: string };

/**
 * Click-to-edit single-line text. Enter or blur saves, Esc cancels.
 * Shows saving / saved / error inline so a non-technical user always knows whether a change stuck.
 */
export function EditableText({
  value,
  save,
  label,
  maxLength,
  className = "",
}: {
  value: string;
  save: (next: string) => Promise<SaveResult>;
  label: string;
  maxLength: number;
  className?: string;
}) {
  const [current, setCurrent] = useState(value);
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  // Enter disables the input while saving, and some browsers then fire blur: without this guard
  // that second commit would re-send the old version and report a false conflict.
  const inFlight = useRef(false);

  async function commit() {
    if (inFlight.current) return;
    const next = draft.trim();
    if (next === current) {
      setEditing(false);
      setError(null);
      return;
    }
    if (!next) {
      setError(`${label} can't be empty.`);
      return;
    }
    setStatus("saving");
    inFlight.current = true;
    const result = await save(next).finally(() => {
      inFlight.current = false;
    });
    if (result.ok) {
      setCurrent(next);
      setDraft(next);
      setEditing(false);
      setError(null);
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
    } else {
      setStatus("idle");
      setError(result.message);
    }
  }

  return (
    <div className="min-w-0">
      {editing ? (
        <input
          autoFocus
          aria-label={label}
          value={draft}
          maxLength={maxLength}
          disabled={status === "saving"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              cancelled.current = true;
              setDraft(current);
              setError(null);
              setEditing(false);
            }
          }}
          onBlur={() => {
            if (cancelled.current) cancelled.current = false;
            else void commit();
          }}
          className={`w-full rounded-md border border-zinc-400 bg-white px-1.5 py-0.5 outline-none focus:border-zinc-900 ${className}`}
        />
      ) : (
        <button
          type="button"
          title={`Click to rename`}
          aria-label={`${label}: ${current}. Click to rename`}
          onClick={() => {
            // An Esc that removed the input may never have been followed by a blur; don't let it swallow this edit.
            cancelled.current = false;
            setDraft(current);
            setEditing(true);
          }}
          className={`-mx-1.5 max-w-full truncate rounded-md px-1.5 py-0.5 text-left hover:bg-zinc-200/60 ${className}`}
        >
          {current}
        </button>
      )}
      <span aria-live="polite" className="block text-xs">
        {status === "saving" && <span className="text-zinc-500">Saving…</span>}
        {status === "saved" && <span className="text-emerald-700">Saved</span>}
        {error && <span className="text-red-700">{error}</span>}
      </span>
    </div>
  );
}
