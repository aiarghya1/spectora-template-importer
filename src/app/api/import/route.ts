import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MAX_DIRECT_UPLOAD_BYTES, MAX_UPLOAD_BYTES } from "@/lib/import/file-check";
import { commitImport, prepareImport } from "@/lib/import/commit";
import { previewPayload } from "@/lib/import/preview";
import { STAGING_BUCKET, validStagedPath } from "@/lib/import/staging";

export const maxDuration = 120;

const fields = z.object({
  mode: z.enum(["preview", "commit"]),
  name: z.string().trim().min(1, "Template name can't be empty.").max(200, "Template name is too long.").optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  stagedPath: z.string().max(100).optional(),
  filename: z.string().min(1).max(255).optional(),
});

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ ok: false, stage: "request", code, message }, { status });

/**
 * POST multipart: a small file or a private stagedPath, plus mode and metadata.
 * Stateless by design: commit re-parses the uploaded bytes rather than trusting a client-sent tree.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return fail(401, "unauthenticated", "Please sign in again.");

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_DIRECT_UPLOAD_BYTES + 64 * 1024) return fail(413, "too_large", "Upload this file through private staging.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "bad_request", "The upload was malformed. Please try again.");
  }

  const file = form.get("file");
  const directFile = file instanceof File ? file : null;

  const parsedFields = fields.safeParse({
    mode: form.get("mode"),
    name: form.get("name") ?? undefined,
    sha256: form.get("sha256") ?? undefined,
    stagedPath: form.get("stagedPath") ?? undefined,
    filename: form.get("filename") ?? undefined,
  });
  if (!parsedFields.success) return fail(400, "bad_request", parsedFields.error.issues[0].message);
  const { mode, name, sha256, stagedPath, filename } = parsedFields.data;

  if (mode === "commit" && !sha256) return fail(400, "bad_request", "Preview the file before importing it.");
  if (!directFile && !stagedPath) return fail(400, "no_file", "Choose a file to upload.");
  if (directFile && stagedPath) return fail(400, "bad_request", "Provide exactly one file source.");

  let sourceName: string;
  let bytes: Uint8Array;
  if (stagedPath) {
    const userId = auth.claims.sub;
    if (!userId || !filename || !validStagedPath(stagedPath, userId, filename)) {
      return fail(400, "bad_request", "The staged file path is invalid.");
    }
    const { data: staged, error } = await supabase.storage.from(STAGING_BUCKET).download(stagedPath);
    if (error || !staged) return fail(422, "missing_file", "The staged file is unavailable. Upload it again.");
    if (staged.size > MAX_UPLOAD_BYTES) return fail(413, "too_large", "The file is larger than 20 MB.");
    sourceName = filename;
    bytes = new Uint8Array(await staged.arrayBuffer());
  } else {
    // The exclusive-source checks above guarantee a File in this branch.
    const source = directFile!;
    if (source.size > MAX_DIRECT_UPLOAD_BYTES) return fail(413, "too_large", "Upload this file through private staging.");
    sourceName = source.name;
    bytes = new Uint8Array(await source.arrayBuffer());
  }

  const prepared = prepareImport(sourceName, bytes);
  if (!prepared.ok) return NextResponse.json(prepared, { status: 422 });

  if (mode === "preview") {
    const { data: previousImports } = await supabase
      .from("imports")
      .select("id, created_at, template:templates!imports_template_id_fkey(id, name)")
      .eq("file_sha256", prepared.sha256)
      .order("created_at", { ascending: false })
      .limit(3);
    return NextResponse.json({ ...previewPayload(prepared, bytes.length > MAX_DIRECT_UPLOAD_BYTES), previousImports: previousImports ?? [] });
  }

  if (sha256 && sha256 !== prepared.sha256) {
    return fail(409, "file_changed", "This file is different from the one you previewed. Preview it again before importing.");
  }

  const result = await commitImport(supabase, prepared, name ?? prepared.parse.templateName);
  if (!result.ok) return NextResponse.json(result, { status: result.code === "failed" ? 500 : 429 });
  if (stagedPath) {
    const { error } = await supabase.storage.from(STAGING_BUCKET).remove([stagedPath]);
    if (error) console.error("Could not remove staged import after commit", error);
  }
  return NextResponse.json(result);
}
