"use client";

import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { supabaseEnv } from "@/lib/supabase/env";
import { resumableEndpoint, STAGING_BUCKET, stagedPath } from "./staging";

/** Upload directly to private Storage; the app server never receives the file body. */
export async function stageImportFile(file: File, onProgress?: (percent: number) => void): Promise<string> {
  const supabase = createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error("Your session expired. Sign in again before uploading.");
  const path = stagedPath(session.user.id, file.name, crypto.randomUUID());

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: resumableEndpoint(supabaseEnv().url),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${session.access_token}` },
      metadata: { bucketName: STAGING_BUCKET, objectName: path, contentType: file.type || "application/octet-stream" },
      chunkSize: 6 * 1024 * 1024,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => onProgress?.(Math.round((sent / total) * 100)),
      onError: reject,
      onSuccess: () => resolve(),
    });
    // Every staging path has a fresh nonce. Reusing a previous TUS URL could
    // write to that older path while the server later reads this new path.
    // The retry delays still resume transient failures within this upload.
    upload.start();
  });
  return path;
}

export async function removeStagedFile(path: string): Promise<void> {
  const { error } = await createClient().storage.from(STAGING_BUCKET).remove([path]);
  if (error) throw error;
}
