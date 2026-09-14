import { createClient } from "@supabase/supabase-js";
import { cleanupStaging } from "@/lib/import/cleanup-staging";
import { STAGING_BUCKET } from "@/lib/import/staging";

export const maxDuration = 120;

/** Vercel sends CRON_SECRET as a bearer token on each scheduled request. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ ok: false, error: "Cleanup is not configured." }, { status: 503 });

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const removed = await cleanupStaging(supabase.storage.from(STAGING_BUCKET));
    return Response.json({ ok: true, removed });
  } catch (error) {
    console.error("Staged import cleanup failed", error);
    return Response.json({ ok: false, error: "Cleanup failed." }, { status: 500 });
  }
}
