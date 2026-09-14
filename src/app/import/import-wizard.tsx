"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { ColumnTable } from "@/components/import/column-table";
import { IssueList } from "@/components/import/issue-list";
import { Reconciliation } from "@/components/import/reconciliation";
import { TreePreview } from "@/components/import/tree-preview";
import { Banner, Button, formatDateTime, formatNumber } from "@/components/ui";
import type { PreparedImport } from "@/lib/import/commit";
import { MAX_UPLOAD_BYTES } from "@/lib/import/file-check";
import { FAILURE_TITLE } from "@/lib/import/labels";

type PreviousImport = { id: string; created_at: string; template: { id: string; name: string } | null };
type Preview = Extract<PreparedImport, { ok: true }> & { previousImports: PreviousImport[] };
type Failure = { ok: false; code: string; message: string; detail?: Record<string, unknown> };
type Committed = { ok: true; templateId: string; importId: string };

async function post<T extends { ok: true }>(form: FormData): Promise<T | Failure> {
  try {
    const response = await fetch("/api/import", { method: "POST", body: form });
    const json: unknown = await response.json().catch(() => null);
    if (json && typeof json === "object" && "ok" in json) return json as T | Failure;
    return response.status === 413
      ? { ok: false, code: "too_large", message: "The file is larger than 4 MB." }
      : { ok: false, code: `http_${response.status}`, message: "The server returned an unexpected response. Nothing was imported — please try again." };
  } catch {
    return { ok: false, code: "network", message: "Couldn't reach the server. Check your connection — nothing was imported." };
  }
}

/**
 * Two-step import: preview (parse only, nothing saved) → commit (server re-parses the same bytes,
 * verifies the hash matches the preview, and writes everything in one transaction).
 */
export function ImportWizard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "preview" | "saving">("idle");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);

  async function choose(next: File) {
    const id = ++requestId.current; // ignore responses for files the user has since replaced
    setFile(next);
    setPreview(null);
    setFailure(null);
    if (next.size > MAX_UPLOAD_BYTES) {
      setFailure({ ok: false, code: "too_large", message: `The file is ${(next.size / 1024 / 1024).toFixed(1)} MB; the limit is 4 MB.` });
      return;
    }
    setPhase("reading");
    const form = new FormData();
    form.set("mode", "preview");
    form.set("file", next);
    const result = await post<Preview>(form);
    if (id !== requestId.current) return;
    if (result.ok) {
      setPreview(result);
      setName(result.parse.templateName);
      setPhase("preview");
    } else {
      setFailure(result);
      setPhase("idle");
    }
  }

  async function commit() {
    if (!file || !preview) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setFailure({ ok: false, code: "invalid", message: "Give the template a name before importing." });
      return;
    }
    setPhase("saving");
    setFailure(null);
    const form = new FormData();
    form.set("mode", "commit");
    form.set("file", file);
    form.set("name", trimmed);
    form.set("sha256", preview.sha256);
    const result = await post<Committed>(form);
    if (result.ok) {
      router.push(`/templates/${result.templateId}?imported=1`);
    } else {
      setFailure(result);
      setPhase("preview");
    }
  }

  function reset() {
    requestId.current++;
    setFile(null);
    setPreview(null);
    setFailure(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) void choose(dropped);
  }

  if (!preview) {
    return (
      <div className="space-y-4">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragging ? "border-zinc-900 bg-zinc-100" : "border-zinc-300 bg-white hover:border-zinc-400"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            disabled={phase === "reading"}
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              if (chosen) void choose(chosen);
            }}
          />
          {phase === "reading" ? (
            <span aria-live="polite" className="text-sm text-zinc-700">
              Reading <strong>{file?.name}</strong>…
            </span>
          ) : (
            <>
              <span className="text-base font-medium text-zinc-900">Drop your Spectora export here</span>
              <span className="mt-1 text-sm text-zinc-500">or click to choose a file · .xlsx, .xls or .csv · up to 4 MB</span>
            </>
          )}
        </label>
        {failure && <FailurePanel failure={failure} />}
      </div>
    );
  }

  const { parse } = preview;
  const saving = phase === "saving";

  return (
    <div className="space-y-10">
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Preview — nothing saved yet</p>
            <p className="mt-0.5 truncate font-medium">{preview.filename}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Sheet &ldquo;{parse.sheetName}&rdquo; · headers on row {parse.stats.headerRow} ·{" "}
              <span title={`SHA-256 ${preview.sha256}`}>fingerprint {preview.sha256.slice(0, 10)}…</span>
            </p>
          </div>
          <Button onClick={reset} disabled={saving}>
            Choose a different file
          </Button>
        </div>

        {preview.previousImports.length > 0 && (
          <div className="mt-4">
            <Banner tone="warning" title="You've imported this exact file before">
              <ul className="list-disc pl-5">
                {preview.previousImports.map((p) => (
                  <li key={p.id}>
                    {formatDateTime(p.created_at)}
                    {p.template ? (
                      <>
                        {" "}as{" "}
                        <Link href={`/templates/${p.template.id}`} className="underline">
                          {p.template.name}
                        </Link>
                      </>
                    ) : (
                      " (that template has since been deleted)"
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-1">Importing again creates a separate template.</p>
            </Banner>
          </div>
        )}

        <label className="mt-5 block max-w-lg text-sm font-medium">
          Template name
          <input
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-normal"
          />
        </label>

        {parse.stats.skippedRows > 0 && (
          <div className="mt-4">
            <Banner tone="warning" title={`${formatNumber(parse.stats.skippedRows)} row(s) can't be imported`}>
              They&apos;re listed under &ldquo;Skipped&rdquo; below with their original values, and will stay in the import report.
            </Banner>
          </div>
        )}
        {failure && (
          <div className="mt-4">
            <FailurePanel failure={failure} />
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => void commit()} disabled={saving}>
            {saving ? "Importing…" : "Import template"}
          </Button>
          <p className="text-xs text-zinc-500">All-or-nothing: if anything fails, nothing is saved.</p>
        </div>
      </section>

      <section aria-labelledby="reconcile-heading">
        <h2 id="reconcile-heading" className="text-lg font-semibold">Did everything come across?</h2>
        <div className="mt-3">
          <Reconciliation stats={parse.stats} />
        </div>
      </section>

      <section aria-labelledby="issues-heading">
        <h2 id="issues-heading" className="text-lg font-semibold">What to review</h2>
        <p className="mt-1 text-sm text-zinc-600">Everything that was skipped, changed, or can&apos;t be edited here.</p>
        <div className="mt-3">
          <IssueList issues={parse.issues} />
        </div>
      </section>

      <section aria-labelledby="tree-heading">
        <h2 id="tree-heading" className="text-lg font-semibold">What will be created</h2>
        <p className="mt-1 text-sm text-zinc-600">Open a section to check items and comment text against Spectora.</p>
        <div className="mt-3">
          <TreePreview sections={parse.sections} />
        </div>
      </section>

      <section aria-labelledby="columns-heading">
        <h2 id="columns-heading" className="text-lg font-semibold">How columns were read</h2>
        <div className="mt-3">
          <ColumnTable columns={parse.columns} />
        </div>
      </section>
    </div>
  );
}

function FailurePanel({ failure }: { failure: Failure }) {
  const headers = failure.detail?.foundHeaders;
  const issues = failure.detail?.issues;
  return (
    <Banner tone="error" title={FAILURE_TITLE[failure.code] ?? "The import didn't work"}>
      <p>{failure.message}</p>
      {Array.isArray(headers) && headers.length > 0 && (
        <p className="mt-2">
          Headers we found: <span className="font-mono text-xs">{headers.map(String).join(" · ")}</span>
        </p>
      )}
      {Array.isArray(issues) && issues.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {(issues as Array<{ source_row: number | null; message: string }>).slice(0, 5).map((issue, i) => (
            <li key={i}>
              {issue.source_row !== null && `Row ${issue.source_row}: `}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs opacity-80">Nothing was imported.</p>
    </Banner>
  );
}
