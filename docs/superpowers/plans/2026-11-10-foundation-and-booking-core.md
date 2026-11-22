# SEA.D.CHANGE — Plan 1: Foundation & Booking Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Next.js + Supabase app where a verified parent logs in by magic link, sees their own children, and submits a lesson request that atomically holds a seat. All rules are enforced on the server, protected by RLS, and covered by tests.

**Architecture:** This is a layered, hexagonal design. `src/domain` is pure TypeScript: rules, state machines, time and money. It does no I/O and is tested with Vitest. `src/application` holds use cases that orchestrate the domain through ports (interfaces). `src/infrastructure` implements those ports with Supabase and is server-only. `src/ui` holds design-system and feature components with no business logic. `src/app` holds thin Next.js routes and server actions that validate input with zod and call the use cases.

Anything that must be atomic happens inside Postgres functions (RPC) with row locks and exclusion constraints. That covers seat capture, approval, punching and payment. RLS is the security boundary. Hiding a UI element is never the protection.

**Tech Stack:**
- Next.js (latest stable, App Router, ≥15), TypeScript strict
- Tailwind CSS v4 with CSS-variable tokens, Motion only where CSS can't do the job
- Supabase: Postgres, Auth magic link, private Storage, RLS
- zod, `@date-fns/tz`
- Vitest, Testing Library, pgTAP (`supabase test db`), Playwright

**Spec:** `docs/spec/SEA-D-CHANGE-Full-Specification.pdf` (text: `docs/spec/spec-extracted.txt`). Product context: `PRODUCT.md`. Approved visual direction and mockup: `mockups/prototype.html`, contract in `.impeccable/surfaces/mockups-prototype-html.md`.

## Roadmap (separate plans, each shippable)

| Plan | Scope | Spec screens |
|---|---|---|
| **1 (this)** | Scaffold, design system, domain core, tenancy and RLS schema, magic-link auth, parent home, booking request | G02 G03 P01 P08 (partial) |
| 2 | Student registration, health declaration (versioned, signature in private storage), child card, family/guardians | P02–P06 P12 A04 |
| 3 | Admin calendar, requests approve/decline, lesson card, availability publishing, blocks, overview | A01 A05–A11 |
| 4 | Punch cards, payments ledger, attendance and punching, corrections with counter-entries | P10 A14 A15 |
| 5 | Instructor workday, lesson report, availability reporting, pool display | I01–I05 |
| 6 | Groups, recurring series, waitlist, bulk actions | A12 A13 P11 |
| 7 | Notifications queue and templates, content/promos, reports, settings, staff and permissions, multi-business, support access | A16–A24 S01 S02 |

## Global Constraints

- Hebrew only, `<html lang="he" dir="rtl">`; email and phone inputs are `dir="ltr"`.
- Business timezone `Asia/Jerusalem` including DST. Week starts Sunday. Dates are shown `d.m.yyyy` and times as 24h `HH:mm`. Store `timestamptz`.
- Money is integer agorot in the DB and the domain (`bigint` / branded `number`). Never use floats. Show amounts as ₪ with up to 2 decimals.
- Parents may cancel or change **up to 24 hours before start, inclusive of exactly 24h**. Below that it is blocked.
- A pending request holds a seat. Approve, cancel, complete, punch and payment never execute twice on a double click or a retry. Each mutation carries a client-generated `attempt_id` (uuid) that the server dedupes.
- A student can't be in two overlapping sessions. An instructor can't run two different sessions at once. Participants never exceed capacity.
- A parent sees only their own students. An instructor never receives health, signatures, balances or payments in any response.
- Signed declarations, payments, punches, admin decisions and permission changes are append-only history. There is no UPDATE/DELETE path.
- When debt is zero, the parent UI renders no debt element at all.
- A failed notification never rolls back a saved business action. The two states are shown separately.
- Status is always a word plus an icon, never color alone. Touch targets are ≥44×44. Target WCAG 2.2 AA.
- Success messages appear only after the server confirms. An unknown outcome shows "בודקים אם הפעולה נשמרה" and never invites a new attempt.
- Magic-link tokens are never left in the URL history. Secrets, tokens, signatures and medical data never appear in logs or analytics.
- The domain layer must not import from `next`, `@supabase/*`, `src/infrastructure` or `src/ui`. ESLint enforces this.
- Test data is synthetic only. Test environments must never send real messages.

## Review Focus

1. **Stale availability response after fast re-selection (T09).** A parent switches child, service or day quickly, and an older slot fetch resolves last. Expected: the slot list matches the current selection and the selected slot is cleared. Tested in Task 10.
2. **Session expiry mid-booking.** The auth cookie expires between step 4 and send. Expected: the user is redirected to login, the form state survives in `sessionStorage` (without health data), and no request is created. Tested in Task 8.
3. **Network drop after send, before response.** Expected: the UI enters "checking" and retries with the *same* `attempt_id`. The server returns the original result, so exactly one participation exists. Tested in Task 7 (SQL) and Task 9 (use case).
4. **Exactly-24h cancellation boundary across DST.** A lesson on 2026-10-25 at 10:00 (the day Israel leaves DST) checked at 2026-10-24 10:00 local. Expected: decided on real elapsed hours (25h → allowed), not wall-clock. Tested in Task 4.
5. **Parent guesses another student id.** Direct RPC/REST calls with a foreign `student_id` for read, request or photo. Expected: an empty result or a `not_found` error that is identical whether or not the student exists. Tested in Task 6/7 pgTAP.

---

## File Structure

```
src/
  domain/
    time.ts            business-tz helpers
    money.ts           Agorot, parse/format
    policy.ts          cancellation & booking-window rules
    lesson-state.ts    separate state axes + transition guards
    punch-card.ts      balance, reserve/convert/release, card choice
    errors.ts          DomainError codes
  application/
    ports.ts           repository + clock + id interfaces
    request-lesson.ts  use case
    approve-request.ts use case
  infrastructure/
    supabase/server.ts   server client (cookies), server-only
    supabase/admin.ts    service-role client, server-only, used only by tests/seed
    repos/*.ts           port implementations (RPC calls)
  ui/
    tokens.css         design tokens from the prototype
    primitives/        Button, Pill, Vessel, WaveEdge, Band, Field, Choice, Toast
    shell/             AppShell (bottom tabs ↔ top band nav via container query)
    features/booking/  BookingFlow (client), steps
    features/home/     ParentHome
  app/
    layout.tsx  (he/rtl, fonts)    login/page.tsx    auth/callback/route.ts
    (parent)/home/page.tsx   (parent)/book/page.tsx   (parent)/book/actions.ts
    middleware.ts
supabase/
  migrations/0001_tenancy.sql  0002_sessions.sql  0003_rpc_booking.sql
  seed.sql                     synthetic data
  tests/rls_tenancy.test.sql  booking_rpc.test.sql
tests/
  domain/*.test.ts  application/*.test.ts  ui/*.test.tsx  e2e/*.spec.ts
```

---

### Task 1: Scaffold, tooling and layer boundaries

**Files:**
- Create: the project via `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`
- Create: `vitest.config.ts`, `tests/domain/sanity.test.ts`, `.env.example`
- Modify: `eslint.config.mjs` to add `no-restricted-imports` for `src/domain/**`, blocking `next*`, `@supabase/*`, `@/infrastructure/*`, `@/ui/*`, `@/app/*`
- Modify: `tsconfig.json` to set `"strict": true, "noUncheckedIndexedAccess": true`

**Interfaces:** Produces the scripts `npm test` (vitest run), `npm run lint`, `npm run typecheck` (`tsc --noEmit`), `npm run e2e` (playwright).

- [ ] **Step 1:** `git init`, then add a `.gitignore` covering `.env*.local`, `.impeccable/live`, `/test-results`.
- [ ] **Step 2:** Scaffold. Install `vitest @testing-library/react @testing-library/jest-dom jsdom zod @date-fns/tz @supabase/ssr @supabase/supabase-js server-only` and `-D @playwright/test`.
- [ ] **Step 3:** Write `tests/domain/boundary.test.ts`. It runs ESLint programmatically on a fixture `tests/fixtures/bad-domain.ts` that imports `next/headers` under a virtual path `src/domain/x.ts` and asserts 1 error with ruleId `no-restricted-imports`.
- [ ] **Step 4:** Run `npm test`. Expected: FAIL (rule not configured).
- [ ] **Step 5:** Add the ESLint rule. Run `npm test && npm run lint && npm run typecheck`. Expected: PASS.
- [ ] **Step 6:** Commit `chore: scaffold next app with layer boundaries`.

### Task 2: Design tokens, RTL root and UI primitives

**Files:**
- Create: `src/ui/tokens.css`. Copy the `:root` app-world tokens verbatim from `mockups/prototype.html` (`--navy` … `--free-bg`, easings `--e-out` `--e-io` `--e-dr`).
- Create: `src/ui/primitives/{Button,Pill,Vessel,WaveEdge,Band,Field,Choice,Toast}.tsx`, `src/ui/shell/AppShell.tsx`, `src/ui/icons.tsx` (one stroke icon set, 1.8 stroke, matching the prototype sprite)
- Modify: `src/app/layout.tsx` to use `next/font/google` with Assistant (400–800) and Karantina (400, 700), `lang="he" dir="rtl"`, and to import `tokens.css`
- Test: `tests/ui/primitives.test.tsx`

**Interfaces:**
- `Button({variant:'primary'|'solid'|'ghost'|'quiet'|'danger', loading?:boolean, loadingLabel?:string, ...ButtonHTMLAttributes})`. While loading it sets `disabled` + `aria-busy="true"` and shows `loadingLabel` (default `"שומרים…"`).
- `Pill({kind:'ok'|'wait'|'bad'|'done'|'free'|'live', children})` always renders the icon for the kind plus the text.
- `Vessel({level:number /*0..100*/, reserved?:number, size?:'md'|'sm'|'xs'|'wide', label:string})` renders `role="img"` with `aria-label={label}`. The level animates via a CSS `height` transition of 1000ms on `--e-io`.
- `AppShell({role:'parent'|'admin'|'instructor', current:string, children})`. Below a container width of 760px it renders bottom tabs. At 760px and above it renders top band links. Active item gets `aria-current="page"`.

- [ ] **Step 1:** Write the tests:
  - `Pill` with `kind="wait"` renders the text "ממתין" and an `svg`.
  - `Button loading` is disabled, has `aria-busy="true"` and shows the text "שומרים…".
  - `Vessel level={70} label="נותרו 7 מתוך 10"` exposes `getByRole('img',{name:'נותרו 7 מתוך 10'})`.
  - `AppShell` marks the current link with `aria-current="page"`.
- [ ] **Step 2:** Run `npm test -- primitives`. Expected: FAIL.
- [ ] **Step 3:** Implement the primitives by porting CSS from the prototype into CSS modules or Tailwind `@layer components`. Keep `@media (hover:hover) and (pointer:fine)` gating and `prefers-reduced-motion` from the prototype.
- [ ] **Step 4:** Run the tests. Expected: PASS. Run `npm run dev` and check `/` renders RTL in Assistant.
- [ ] **Step 5:** Commit `feat(ui): design tokens and primitives from approved mockup`.

### Task 3: Domain — time and money

**Files:** Create `src/domain/time.ts` and `src/domain/money.ts`. Test `tests/domain/time.test.ts` and `tests/domain/money.test.ts`.

**Interfaces:**
- `BUSINESS_TZ = 'Asia/Jerusalem'`
- `formatBusinessDate(instant: Date, tz?: string): string` → `"12.11.2026"`
- `formatBusinessTime(instant: Date, tz?: string): string` → `"16:30"`
- `weekStartSunday(instant: Date, tz?: string): Date` (00:00 local on Sunday)
- `type Agorot = number & {readonly __brand:'Agorot'}`
- `parseShekel(input: string): Agorot` throws `DomainError('invalid_amount')` for more than 2 decimals, negatives or non-numbers
- `formatShekel(a: Agorot): string` → `"200 ₪"` or `"1,240.50 ₪"`

- [ ] **Step 1:** Write the tests:
  - `formatBusinessTime(new Date('2026-11-12T14:30:00Z')) === '16:30'`
  - `formatBusinessTime(new Date('2026-07-01T13:30:00Z')) === '16:30'` (DST +3)
  - `weekStartSunday(new Date('2026-11-10T12:00:00Z'))` formats as `08.11.2026`. Note: use `formatBusinessDate` → `'8.11.2026'`.
  - `parseShekel('200') === 20000`, `parseShekel('0.1') === 10`, `parseShekel('1.234')` throws, `parseShekel('-5')` throws
  - `formatShekel(124050 as Agorot) === '1,240.50 ₪'`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with `@date-fns/tz` `TZDate`. Parse money with a regex `^\d+(\.\d{1,2})?$` and integer math (no `parseFloat` multiplication).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(domain): business time and agorot money`.

### Task 4: Domain — policy and lesson state axes

**Files:** Create `src/domain/policy.ts`, `src/domain/lesson-state.ts` and `src/domain/errors.ts`. Test `tests/domain/policy.test.ts` and `tests/domain/lesson-state.test.ts`.

**Interfaces:**
- `class DomainError extends Error { code: DomainErrorCode }` with codes `'invalid_amount'|'too_late_to_cancel'|'not_pending'|'not_ended'|'already_recorded'|'health_not_valid'|'capacity_full'|'slot_taken'|'overlap_student'|'overlap_instructor'|'not_found'`
- `canParentChange(start: Date, now: Date, hours = 24): boolean`, true iff `start.getTime() - now.getTime() >= hours*3600_000`
- `type RequestState = 'pending'|'approved'|'declined'|'cancelled'`, `type Attendance = 'unreported'|'completed'|'no_show'`
- `assertCanApprove(r: {state: RequestState}): void` throws `not_pending`
- `assertCanRecordAttendance(p: {attendance: Attendance}, sessionEnd: Date, now: Date): void` throws `not_ended` if `now < sessionEnd`, and `already_recorded` if attendance ≠ unreported
- `countsTowardCompleted(a: Attendance): boolean`, true only for `completed`

- [ ] **Step 1:** Write the tests:
  - Exactly 24h before → true. 24h minus 1ms → false.
  - DST: start `2026-10-25T07:00:00Z` (10:00 local after fallback), now `2026-10-24T07:00:00Z` (10:00 local) → 24h elapsed → true. Now `2026-10-24T08:00:01Z` → false.
  - `assertCanApprove({state:'approved'})` throws code `not_pending`.
  - Attendance at `sessionEnd - 1s` throws `not_ended` (T16). A second record throws `already_recorded` (T17).
  - `countsTowardCompleted('no_show') === false`.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(domain): cancellation policy and lesson state guards`.

### Task 5: Domain — punch-card ledger

**Files:** Create `src/domain/punch-card.ts`. Test `tests/domain/punch-card.test.ts`.

**Interfaces:**
- `type CardEntry = {kind:'purchase'|'reserve'|'release'|'punch'|'reverse_punch', units:number, participationId?:string, at:Date}`
- `type Card = {id:string, serviceIds:string[], expiresAt:Date|null, purchasedAt:Date, entries:CardEntry[]}`
- `availableUnits(card: Card): number` = purchased − (punches − reversed) − open reservations
- `openReservation(card: Card, participationId: string): boolean`
- `chooseCard(cards: Card[], serviceId: string, at: Date): Card | null`. Valid for the service and not expired at `at`, with `availableUnits>0`. Ordered by earliest `expiresAt` (null last), then earliest `purchasedAt`.
- `planPunch(card: Card, participationId: string): CardEntry[]`. If a reservation is open, it converts it (`release` and `punch` in one step: net −1, never −2). It throws `already_recorded` if a punch for that participation already exists.

- [ ] **Step 1:** Write the tests:
  - 10 purchased + 1 reserve → available 9. `planPunch` on the reserved participation → available stays 9 (not 8).
  - A second `planPunch` for the same id throws `already_recorded`.
  - `chooseCard` picks the card expiring 2026-12-01 over 2027-01-01, ignores an expired one, ignores one without the service.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(domain): punch-card ledger with reservation conversion`.

### Task 6: Supabase project, tenancy schema and RLS

**Environment decision (needed from the owner before this task):** Docker isn't installed. Choose (a) install Docker Desktop and use `supabase start` locally, or (b) create a free Supabase **dev** project in the cloud now and keep production separate later. With (b), pgTAP tests run through `supabase test db --db-url` against the dev project. The migrations stay identical either way.

**Files:**
- Create: `supabase/migrations/0001_tenancy.sql`, `supabase/tests/rls_tenancy.test.sql`, `supabase/seed.sql`
- Create: `src/infrastructure/supabase/{server,admin}.ts` (both `import 'server-only'`)

**Schema (decisions):**
- `businesses(id, name, timezone default 'Asia/Jerusalem', status)`
- `branches(id, business_id)`
- `memberships(user_id → auth.users, business_id, role in ('owner','manager','instructor','parent'), branch_ids uuid[], capabilities text[], starts_at, ends_at)`
- `students(id, business_id, branch_id, first_name, last_name, birth_date, status, photo_path)`
- `guardianships(user_id, student_id, scope text[] default '{view,book,health,finance}')`
- `staff(id, business_id, user_id null, display_name, color)`
- `services(id, business_id, name, duration_min, capacity, price_agorot bigint, requires_approval bool default true)`
- `resources(id, branch_id, name, capacity)`
- SQL helpers (`security definer`, `stable`, `search_path=''`): `app.is_staff(biz uuid, roles text[])`, `app.is_guardian(student uuid)`, `app.branch_allowed(biz uuid, branch uuid)`
- RLS enabled on every table. Policies:
  - Parents: `students` only via `is_guardian`.
  - Instructors: `students` only for students in their sessions (policy added in 0002). Instructors have **no** policy on health tables (Plan 2).
  - Managers: limited to `branch_allowed`.

- [ ] **Step 1:** Write the pgTAP tests (with `set local role authenticated` and `request.jwt.claims` per user, against synthetic seed users):
  - Parent A `select count(*) from students` = 2 (their kids). Selecting a parent B student id returns 0 rows (T02).
  - A manager scoped to branch 1 can't see a branch 2 student (T26).
  - An anon role sees 0 rows on every table.
- [ ] **Step 2:** Run `supabase test db`. Expected: FAIL (tables missing).
- [ ] **Step 3:** Write migration 0001 and the seed. **Step 4:** Run `supabase db reset && supabase test db`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): tenancy schema with RLS and tests`.

### Task 7: Sessions, participations, idempotent booking RPC

**Files:** Create `supabase/migrations/0002_sessions.sql`, `supabase/migrations/0003_rpc_booking.sql` and `supabase/tests/booking_rpc.test.sql`.

**Schema (decisions):**
- `create extension btree_gist`
- `activity_windows(id, business_id, service_id, staff_id, resource_id, during tstzrange, published bool)`. These are the published windows that parents can book.
- `sessions(id, business_id, branch_id, service_id, staff_id, resource_id, during tstzrange, capacity int, status in ('planned','cancelled','ended'), terms jsonb /* price, duration, policy snapshot */)`
- Constraint: `EXCLUDE USING gist (staff_id WITH =, during WITH &&) WHERE (status <> 'cancelled')`. One instructor, one session at a time.
- `participations(id, session_id, student_id, during tstzrange /* copied */, request_state, attendance, payment_method, created_by, attempt_id uuid unique)`
- Constraint: `EXCLUDE USING gist (student_id WITH =, during WITH &&) WHERE (request_state in ('pending','approved'))`
- `action_attempts(id uuid pk, user_id, kind, status in ('started','done','rejected'), result jsonb, created_at)`
- `audit_log(id bigint identity, business_id, actor, action, entity, entity_id, before jsonb, after jsonb, reason, at)`. Revoke `update, delete` from all roles. Inserts happen only in RPCs.
- `request_lesson(p_attempt uuid, p_student uuid, p_window uuid, p_start timestamptz, p_payment text) returns jsonb`:
  - `security definer`, `search_path=''`
  - Checks `is_guardian(p_student)` and returns `{"error":"not_found"}` otherwise (same shape whether or not the student exists).
  - Checks the window is published and contains `[p_start, p_start+duration)`.
  - Checks valid health. Until Plan 2 this is stubbed by `app.health_valid_at(student, ts)` returning true.
  - Locks with `pg_advisory_xact_lock(hashtext(p_window::text || p_start::text))`.
  - Finds or creates the session and counts active participations against capacity.
  - Inserts the participation as `pending`.
  - Records the attempt and returns `{"participation_id", "session_id", "state":"pending"}`.
  - On a repeated `p_attempt` it returns the stored result without new rows.
  - Maps exclusion violations to `{"error":"overlap_student"}` and full capacity to `{"error":"slot_taken"}`.
- `approve_request(p_attempt uuid, p_participation uuid) returns jsonb`. Staff with an approval capability only. Re-checks capacity and health, sets approved and writes the audit row. Idempotent by attempt. Approving an already-approved participation with a different attempt returns `{"error":"not_pending"}` without a second audit row (T10).

- [ ] **Step 1:** Write the pgTAP tests:
  - Capacity 1: parent A requests (ok). Parent B requests the same start → `slot_taken` (T08).
  - The same `p_attempt` twice → one participation row, identical result.
  - A student overlap in another window → `overlap_student`.
  - `approve_request` twice → one approved row and one audit row (T10).
  - A parent calling `approve_request` → `not_found`.
  - A request outside a published window → `not_found` (T06).
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement the migrations. **Step 4:** Run `supabase db reset && supabase test db`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): sessions, exclusion constraints, idempotent booking rpc`.

### Task 8: Magic-link auth, session middleware, role landing

**Files:**
- Create: `src/app/login/page.tsx` (G02), `src/app/login/actions.ts`, `src/app/auth/callback/route.ts` (G03), `src/middleware.ts`, `src/application/resolve-home.ts`
- Test: `tests/application/resolve-home.test.ts`, `tests/e2e/auth.spec.ts`

**Interfaces:**
- `resolveHome(memberships: {role:string, business_id:string}[]): '/home'|'/admin'|'/workday'|'/choose-workspace'|'/no-access'`. With several businesses or roles it returns `/choose-workspace`. With none it returns `/no-access`.
- `sendMagicLink(formData)` is a server action. It validates the email with zod and always returns the same neutral `{ok:true}` whether or not the account exists. Rate limit: 1 per 30s per email+IP, returning `{error:'rate_limited', retryInSec}`.
- The callback route exchanges the code and `redirect`s to `resolveHome(...)`, so the token never stays in history. Expired or used links go to `/login?state=expired`.

- [ ] **Step 1:** Write the tests:
  - `resolveHome([{role:'parent',...}]) === '/home'`, owner → `/admin`, two businesses → `/choose-workspace`, `[]` → `/no-access`.
  - e2e: request a link for a seeded parent, fetch it via the admin `generateLink` (test-only), visit it, and assert `page.url()` has no `code=`/`token`, lands on `/home`, and the back button after logout doesn't show `/home` content (T31).
  - e2e (Review Focus 2): with the cookie cleared mid-flow, `/book` submit redirects to `/login` and no participation is created.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement with `@supabase/ssr` cookie handling. Logout clears client caches and `sessionStorage`. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(auth): magic link login with role-based landing`.

### Task 9: Application layer — ports and booking use cases

**Files:** Create `src/application/ports.ts`, `src/application/request-lesson.ts`, `src/infrastructure/repos/booking-repo.ts` and `src/app/(parent)/book/actions.ts`. Test `tests/application/request-lesson.test.ts`.

**Interfaces:**
- `interface BookingRepo { requestLesson(i: {attemptId:string, studentId:string, windowId:string, start:Date, payment:'card'|'bit'|'paybox'|'cash'}): Promise<RequestResult>; findAttempt(attemptId:string): Promise<RequestResult|null> }`
- `type RequestResult = {ok:true, participationId:string, state:'pending'} | {ok:false, code: DomainErrorCode} | {ok:'unknown'}`
- `requestLesson(repo: BookingRepo, input): Promise<RequestResult>`. On a network or timeout error it calls `findAttempt` with the **same** id. If nothing is found it returns `{ok:'unknown'}` and never generates a new id.
- The server action `submitBooking(formData)` takes `attemptId` from a hidden input created once per booking flow (`crypto.randomUUID()` on mount).

- [ ] **Step 1:** Write the tests with an in-memory fake repo:
  - The first call throws a network error and `findAttempt` returns the result → the use case returns the ok result and `requestLesson` was invoked once with that attemptId (Review Focus 3).
  - Network error plus `findAttempt` null → `{ok:'unknown'}`.
  - The fake returns `slot_taken` → passed through.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. The repo calls `supabase.rpc('request_lesson', …)`. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(app): idempotent request-lesson use case`.

### Task 10: Parent home and booking flow UI

**Files:**
- Create: `src/ui/features/home/ParentHome.tsx`, `src/app/(parent)/home/page.tsx`, `src/ui/features/booking/{BookingFlow,StepChild,StepService,StepTime,StepPayment,StepSummary}.tsx`, `src/app/(parent)/book/page.tsx`, `src/app/api/slots/route.ts`
- Test: `tests/ui/booking-flow.test.tsx`, `tests/e2e/booking.spec.ts`

**Interfaces:**
- `GET /api/slots?student=&service=&staff=&day=` returns `{slots:{windowId,start,staffName}[]}` from published windows minus held capacity. It is RLS-scoped to the guardian.
- `BookingFlow` keeps `selection` and a `requestKey` (`student|service|staff|day`). A slot response is applied only if its key equals the current key, and every fetch is aborted with `AbortController` on change (T09).
- Copy and layout follow `mockups/prototype.html` (parent home and booking): five steps; a child without valid health is disabled with a link to health; summary shows the cancellation policy; success shows request number and `Pill kind="wait"` "ממתינה לאישור". Bit/PayBox links appear only after success.

- [ ] **Step 1:** Write the tests:
  - Component: choose day A and resolve its fetch slowly, choose day B and resolve fast, then resolve A. The rendered slots are B's and no slot is selected (T09 / Review Focus 1).
  - Component: switching the instructor clears the selected slot.
  - Component: Send shows "שולחים…" and is disabled. On `{ok:'unknown'}` it shows "בודקים אם הפעולה נשמרה" with no resend button.
  - e2e: a seeded parent books Segev → success screen with "ממתינה לאישור", and a DB check shows one pending participation (T01 partial).
  - e2e: Dean (no health) is disabled at step 1.
  - e2e: zero debt → no element containing "חוב" on `/home` (T22).
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. Port the markup and CSS from the prototype into components and keep server data loading in `page.tsx`. **Step 4:** Run `npm test && npm run e2e`. Expected: PASS.
- [ ] **Step 5:** Run the impeccable detector: `.claude/skills/impeccable/scripts/impeccable detect --json src/ui`. Fix mechanical findings.
- [ ] **Step 6:** Commit `feat(parent): home and booking request flow`.
