import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/** Browser client (anon key only; RLS enforces access). */
export function createClient() {
  const { url, anonKey } = supabaseEnv();
  return createBrowserClient(url, anonKey);
}
