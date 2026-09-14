import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { validStagedPath } from "./staging";

type Bucket = ReturnType<SupabaseClient["storage"]["from"]>;

const PAGE_SIZE = 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const USER_ID = /^[0-9a-f-]{36}$/;

/** List first, then delete: deleting during offset pagination would skip objects. */
export async function cleanupStaging(bucket: Bucket, now = Date.now()): Promise<number> {
  const folders: string[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await bucket.list("", { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    const page = data ?? [];
    for (const entry of page) if (entry.id === null && USER_ID.test(entry.name)) folders.push(entry.name);
    if (page.length < PAGE_SIZE) break;
  }

  let removed = 0;
  for (const userId of folders) {
    const expired: string[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await bucket.list(userId, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      const page = data ?? [];
      for (const entry of page) {
        const path = `${userId}/${entry.name}`;
        if (entry.id && entry.created_at && now - Date.parse(entry.created_at) >= RETENTION_MS && validStagedPath(path, userId, entry.name)) {
          expired.push(path);
        }
      }
      if (page.length < PAGE_SIZE) break;
    }
    for (let offset = 0; offset < expired.length; offset += PAGE_SIZE) {
      const batch = expired.slice(offset, offset + PAGE_SIZE);
      const { error } = await bucket.remove(batch);
      if (error) throw error;
      removed += batch.length;
    }
  }
  return removed;
}
