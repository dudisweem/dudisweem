# SWEEMER

Swimming school web app (Hebrew, RTL, mobile-first): parents book lessons for their kids, the owner runs the
school from an admin area, instructors see their day, record attendance and progress, and manage their own availability.

- Next.js 16 (App Router) + TypeScript, deployed on Vercel
- Supabase: Postgres with row-level security, Auth (email + password, Google), all business mutations in
  `SECURITY DEFINER` RPCs
- Design: `mockups/prototype.html`, product brief: `PRODUCT.md`, spec: `docs/spec/`

## Develop

```bash
npm ci
npm run dev          # http://localhost:3000
```

The Supabase URL and publishable key are public values with defaults in `src/lib/env.ts`; override with
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). No secret is needed to run.

## Checks

```bash
npm run typecheck    # route types + tsc
npx eslint src
npm test             # vitest: domain rules (money, DST, cancellation, health), progress, PayNow, FormGuard
npx next build
```

CI (`.github/workflows/ci.yml`) runs all four on every push to `main` and on pull requests.

## Database

Migrations live in `supabase/migrations/` (numbered, applied in order to the Supabase project).

### End-to-end database test

`supabase/tests/e2e.sql` runs the whole booking flow against the real database and rolls everything back:
parent books → admin approves → lesson appears in the calendar, instructor day, pool board and reports;
role guards hold; a stranger family gets `not_found`; an accepted guardian has access.

Run it in the Supabase SQL editor (or the Supabase MCP `execute_sql` tool). It always finishes with an
error whose message is the step-by-step result — that error is what rolls the transaction back.
Every line shows the actual value next to its `expect` hint. It needs only an owner admin and an active
private (capacity 1) service; it creates its own synthetic users, child and working hours.

Identity counters are not transactional, so afterwards (when there are no real bookings yet) you can run
`alter table public.bookings alter column number restart with 1;`.
