/**
 * The one import pipeline, shared by the upload route and the seed script:
 * file check → parse → payload → import_template RPC (single transaction).
 * Relative imports only, so it also runs under tsx outside Next.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkUpload } from "./file-check";
import { parseSpectoraExport } from "./parse";
import type { ParseSuccess } from "./types";

export type PreparedImport =
  | { ok: true; sha256: string; filename: string; parse: ParseSuccess }
  | { ok: false; stage: "file" | "parse"; code: string; message: string; detail?: Record<string, unknown> };

/** Strips any directory part and control characters; keeps everything a person would type in a filename. */
export function safeFilename(name: string): string {
  const base = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1);
  let printable = "";
  for (const char of base) {
    const code = char.codePointAt(0) as number; // a string iterator never yields empty strings
    if (code >= 32 && code !== 127) printable += char;
  }
  return (printable.trim() || "upload").slice(0, 255);
}

export function prepareImport(filename: string, bytes: Uint8Array): PreparedImport {
  const check = checkUpload(filename, bytes);
  if (!check.ok) return { ok: false, stage: "file", code: check.code, message: check.message };

  const parse = parseSpectoraExport({ bytes, filename, kind: check.kind });
  if (!parse.ok) return { ok: false, stage: "parse", code: parse.code, message: parse.message, detail: parse.detail };

  return {
    ok: true,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    filename: safeFilename(filename),
    parse,
  };
}

export function buildImportArgs(prepared: Extract<PreparedImport, { ok: true }>, name: string) {
  const { parse } = prepared;
  return {
    p_name: name,
    p_filename: prepared.filename,
    p_file_sha256: prepared.sha256,
    p_source_rows: parse.stats.sourceRows,
    p_summary: { templateName: parse.templateName, sheetName: parse.sheetName, stats: parse.stats, columns: parse.columns },
    p_sections: parse.sections,
    p_issues: parse.issues,
  };
}

export type CommitResult =
  | { ok: true; templateId: string; importId: string }
  | { ok: false; code: "rate_limited" | "quota" | "failed"; message: string };

export async function commitImport(
  supabase: SupabaseClient,
  prepared: Extract<PreparedImport, { ok: true }>,
  name: string,
): Promise<CommitResult> {
  const { data, error } = await supabase
    .rpc("import_template", buildImportArgs(prepared, name))
    .single<{ template_id: string; import_id: string }>();

  if (error || !data) {
    if (error?.code === "54000") {
      return error.message.includes("rate")
        ? { ok: false, code: "rate_limited", message: "Too many imports in the last hour. Please wait and try again." }
        : { ok: false, code: "quota", message: "You've reached the template limit. Delete an old template first." };
    }
    console.error("import_template failed", error);
    return { ok: false, code: "failed", message: "The import couldn't be saved. Nothing was written — please try again." };
  }
  return { ok: true, templateId: data.template_id, importId: data.import_id };
}
