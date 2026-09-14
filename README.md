# Spectora Template Importer

Import a Spectora **Export HTML Text** spreadsheet, check that nothing was lost, then edit and duplicate the
template. Built with Next.js 16 and Supabase for Vercel.

- **Live app:** _add the Vercel URL here_
- **Decisions, limits, verification, time spent:** [NOTES.md](NOTES.md)
- **Architecture decisions:** [docs/DECISIONS.md](docs/DECISIONS.md) · **Schema:** [docs/schema.md](docs/schema.md) ·
  **Export format:** [docs/spectora-export-format.md](docs/spectora-export-format.md) ·
  **Test cases:** [docs/TEST_CASES.md](docs/TEST_CASES.md)

## Reviewer access
Sign in on the live app with the demo account (it opens on the seeded, already-imported template):

| Email | Password |
|---|---|
| _set as `DEMO_EMAIL`_ | _set as `DEMO_PASSWORD`_ |

You can also create your own account from the sign-in page; it starts empty, and you can import the file from
`fixtures/`.

## Input file
Place the real Spectora **Export HTML Text** spreadsheet in `fixtures/`. See `fixtures/README.md` for the
identified source. The export is still needed before the preservation check and seed can run.

## Local setup
Requirements: Node 20.9+ (developed on Node 24) and a Supabase project (the free tier is fine).

```bash
npm install
cp .env.example .env.local        # then fill in the values (see below)
```

### Environment variables
| Variable | Where from | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | app, seed |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon / publishable key) | app, seed |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (service role / secret key) | server-only seed and cleanup cron |
| `CRON_SECRET` | random string of at least 16 characters | authenticates the daily cleanup cron |
| `DEMO_EMAIL`, `DEMO_PASSWORD` | choose them yourself | seed script |

`.env*` files are git-ignored (except `.env.example`). On Vercel, set the two `NEXT_PUBLIC_*` variables,
`SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET`. Keep the latter two server-only.

### Database initialisation
Apply both migrations in filename order: `20260914000000_template_schema.sql` creates the app schema and
`20260914000001_import_staging.sql` creates the private Storage bucket and owner policies for large imports.

Option A, Supabase CLI (bundled as a dev dependency):
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push
```

Option B, dashboard: open **SQL Editor**, paste and run each migration in filename order.

Then, in **Authentication → Providers → Email**, turn off *Confirm email* if you want sign-ups to work
without an email round trip. The demo user is created already confirmed either way.

### Seed the demo account
```bash
npm run seed                       # imports the first export in fixtures/
npm run seed -- path/to/export.xlsx
```
The seed creates or updates the demo user, signs in **as that user** and runs the same import pipeline as the
app (so RLS applies). Re-running with the same file does nothing.

Files up to 4 MB go directly to the import Route Handler. Larger files, up to 20 MB, upload to a private
Supabase Storage bucket via resumable upload. The app removes staged files after a successful import or when
the preview is discarded. A daily Vercel cron job removes abandoned files older than 24 hours. Large-file
previews show exact totals and a sample of the tree and issues; the complete report is available after import.

### Run
```bash
npm run dev                        # http://localhost:3000
```

## Checks
```bash
npm test                           # unit, server, component (jsdom) and database (PGlite) tests
npm run test:coverage              # same, failing below 100% coverage (as in CI)
E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e   # Playwright against `npm run dev` (needs .env.local)
E2E_BASE_URL=https://… E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e   # against a deployment
npm run test:all                   # coverage, then the browser workflow
npm run typecheck
npm run lint
npm run verify:export -- fixtures/<file>   # row-by-row preservation check against a real export
```
Database tests run both migrations in [PGlite](https://pglite.dev) (in-process Postgres), so they need neither
Docker nor a Supabase project.

## Deploy (Vercel)
1. Import the repo in Vercel (framework: Next.js, no build settings needed).
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET`.
3. In Supabase → Authentication → URL Configuration, set the Site URL to the Vercel URL (used for confirmation emails).

## Project layout
```
src/lib/import/        parser, column mapping, file checks, zip guard, preservation verifier (pure, tested)
src/lib/html/          one HTML allowlist for import, render and editor compatibility
src/lib/templates/     server queries and view types
src/app/api/import/    upload route: preview and commit
src/app/templates/     list, editor, import report, server actions
src/components/        editor, import-trust UI, shared UI
supabase/migrations/   schema, RLS, import/duplicate/move functions
supabase/tests/        database tests (PGlite)
scripts/               seed and verify-export CLIs
docs/                  decisions, schema, export format, import invariants
.claude/skills/        reusable agent skill for adding and verifying export fixtures
```
