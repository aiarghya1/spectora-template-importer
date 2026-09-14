/** Shared helpers for CLI scripts (run with tsx). */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const FIXTURES_DIR = join(process.cwd(), "fixtures");

/** First Spectora export in fixtures/, or the path given on the command line. */
export function resolveExportPath(argument: string | undefined): string {
  if (argument) return argument;
  const candidates = existsSync(FIXTURES_DIR)
    ? readdirSync(FIXTURES_DIR).filter((name) => /\.(xlsx|xls|csv)$/i.test(name)).sort()
    : [];
  if (candidates.length === 0) {
    fail("No export found in fixtures/. Add one, or pass a path: npm run <script> -- path/to/export.xlsx");
  }
  return join(FIXTURES_DIR, candidates[0]);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) fail(`Missing ${name}. See README → Environment variables.`);
  return value;
}

export function fail(message: string): never {
  console.error(`✕ ${message}`);
  process.exit(1);
}
