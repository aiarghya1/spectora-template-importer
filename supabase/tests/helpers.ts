/**
 * In-process Postgres (PGlite) with a minimal stand-in for Supabase auth, running every migration.
 * Reuse this for any database test: `const db = await createTestDb(); const alice = await createUser(db);`
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
`;
// Supabase grants table privileges to these roles by default; RLS does the real gating.
const SUPABASE_GRANTS = `
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  grant usage on all sequences in schema public to anon, authenticated;
`;

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  await db.exec(SUPABASE_GRANTS);
  return db;
}

export async function createUser(db: PGlite): Promise<string> {
  const id = randomUUID();
  await db.query(`insert into auth.users (id) values ($1)`, [id]);
  return id;
}

/** Run fn in a transaction as the given user (RLS applies), or as anon when user is null. */
export function asUser(db: PGlite) {
  return <T>(user: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> =>
    db.transaction(async (tx) => {
      await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? ""]);
      return fn(tx);
    });
}

export const IMPORT_SQL = `select * from public.import_template($1::text, $2::text, $3::text, $4::int, $5::jsonb, $6::jsonb, $7::jsonb)`;
