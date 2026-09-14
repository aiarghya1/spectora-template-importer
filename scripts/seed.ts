/**
 * Seed the demo account with an imported template, using exactly the app's import pipeline
 * (the import runs as the demo user, so RLS applies as it would in the browser).
 * Idempotent: re-running with the same file does nothing.
 *
 * Usage: npm run seed [-- path/to/export.xlsx]
 * Needs: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DEMO_EMAIL, DEMO_PASSWORD
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { commitImport, prepareImport } from "../src/lib/import/commit";
import { fail, requireEnv, resolveExportPath } from "./lib";

async function findUserId(admin: SupabaseClient, email: string): Promise<string> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user.id;
    if (data.users.length < 200) break;
  }
  return fail(`Demo user ${email} exists but could not be found.`);
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const email = requireEnv("DEMO_EMAIL");
  const password = requireEnv("DEMO_PASSWORD");
  const path = resolveExportPath(process.argv[2]);

  // 1. Ensure the demo user exists, is confirmed, and has the documented password.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError) {
    if (!/already|registered|exists/i.test(createError.message)) throw createError;
    const id = await findUserId(admin, email);
    const { error } = await admin.auth.admin.updateUserById(id, { password, email_confirm: true });
    if (error) throw error;
  }
  console.log(`Demo user ready: ${email}`);

  // 2. Sign in as the demo user; everything below goes through RLS.
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const bytes = new Uint8Array(readFileSync(path));
  const prepared = prepareImport(basename(path), bytes);
  if (!prepared.ok) fail(`${prepared.code}: ${prepared.message}`);

  const { data: existing, error: lookupError } = await client
    .from("imports")
    .select("template_id")
    .eq("file_sha256", prepared.sha256)
    .not("template_id", "is", null)
    .limit(1);
  if (lookupError) throw lookupError;
  if (existing?.length) {
    console.log(`Already seeded (template ${existing[0].template_id}). Nothing to do.`);
    return;
  }

  const result = await commitImport(client, prepared, prepared.parse.templateName);
  if (!result.ok) fail(result.message);

  const { stats } = prepared.parse;
  console.log(
    `✓ Imported "${prepared.parse.templateName}" → template ${result.templateId}: ` +
      `${stats.sections} sections, ${stats.items} items, ${stats.comments} comments, ${prepared.parse.issues.length} issues recorded.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
