import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MAX_UPLOAD_BYTES } from "@/lib/import/file-check";
import { commitImport, prepareImport } from "@/lib/import/commit";

export const maxDuration = 60;

const fields = z.object({
  mode: z.enum(["preview", "commit"]),
  name: z.string().trim().min(1, "Template name can't be empty.").max(200, "Template name is too long.").optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ ok: false, stage: "request", code, message }, { status });

/**
 * POST multipart: file + mode=preview|commit (+ name, sha256 for commit).
 * Stateless by design: commit re-parses the uploaded bytes rather than trusting a client-sent tree.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return fail(401, "unauthenticated", "Please sign in again.");

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_UPLOAD_BYTES + 64 * 1024) return fail(413, "too_large", "The file is larger than 4 MB.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "bad_request", "The upload was malformed. Please try again.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "no_file", "Choose a file to upload.");

  const parsedFields = fields.safeParse({
    mode: form.get("mode"),
    name: form.get("name") ?? undefined,
    sha256: form.get("sha256") ?? undefined,
  });
  if (!parsedFields.success) return fail(400, "bad_request", parsedFields.error.issues[0].message);
  const { mode, name, sha256 } = parsedFields.data;

  const prepared = prepareImport(file.name, new Uint8Array(await file.arrayBuffer()));
  if (!prepared.ok) return NextResponse.json(prepared, { status: 422 });

  if (mode === "preview") {
    const { data: previousImports } = await supabase
      .from("imports")
      .select("id, created_at, template:templates!imports_template_id_fkey(id, name)")
      .eq("file_sha256", prepared.sha256)
      .order("created_at", { ascending: false })
      .limit(3);
    return NextResponse.json({ ...prepared, previousImports: previousImports ?? [] });
  }

  if (sha256 && sha256 !== prepared.sha256) {
    return fail(409, "file_changed", "This file is different from the one you previewed. Preview it again before importing.");
  }

  const result = await commitImport(supabase, prepared, name ?? prepared.parse.templateName);
  if (!result.ok) return NextResponse.json(result, { status: result.code === "failed" ? 500 : 429 });
  return NextResponse.json(result);
}
