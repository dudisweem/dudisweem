# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (mobile-first responsive; Android + iOS browsers are first-class, desktop is the expanded layout)

## Stack

Next.js (App Router) + TypeScript, Supabase (Postgres + RLS, magic-link auth, private storage), deployed on Vercel. Local-first development (Supabase local stack) before cloud. Domain/business logic isolated from UI.

## Users

- **Parent / client** — on a phone, between other tasks. Registers kids, signs the health declaration, books and cancels lessons, sees punch-card balance. Must see only their own children.
- **Owner / authorized manager (Dudi, Yael)** — phone AND computer equally. Approves requests, runs the calendar, publishes availability, checks health declarations, records payments, reports.
- **Instructor** — phone at poolside. Sees own day, marks attendance, writes lesson report, reports availability one month ahead. Never sees health, money, or signatures.
- **Pool display** — tablet/large screen for staff: previous / now in water / next.
- Platform super-admin (multi-business) — infrastructure role, no default medical access.

## Product Purpose

SEA.D.CHANGE — school for swimming, water skills, and cold exposure. One system from a family's first visit through calendars, staff, health, professional progress, and finance. Success: parents book in under a minute without calling; managers approve and run the day without spreadsheets; nothing is double-booked, double-punched, or leaked.

## Positioning

A family-run, high-touch school (Dudi: 30 years in water, Wingate-certified instructor, hydrotherapist, Watsu, cold exposure, diving examiner; Yael: retired Lt. Col., coach) — learning "as part of entering our home and family". The product must feel personal, calm and confident, not like a booking SaaS.

## Operating Context

Asia/Jerusalem timezone, week starts Sunday, 24h time, dates d/m/y. Full Hebrew RTL; email/phone typed LTR. Payments: Bit, PayBox, cash, punch card (כרטיסייה) — recorded, not cleared online. Manager approval is the default for bookings. 24h cancellation rule. Notifications by email (WhatsApp via business provider later).

## Capabilities and Constraints

Full screen map G01–G05, P01–P12, A01–A24, I01–I05, S01–S02 per spec (`SEA-D-CHANGE-Full-Specification.pdf`, v1, 9 Nov 2026). Separate state axes: session, request, attendance, report, payment, punch-card coverage, health, notification. Idempotent actions; atomic capacity; server-enforced permissions; private media; audit history (no silent delete). Open owner decisions listed in spec §40 (prices, card templates, health wording, retention).

## Brand Commitments

Name SEA.D.CHANGE with existing logo (must not be stretched). Calm, clean, clear, blue water tones (spec). Status always word + icon, never color alone. One icon family, no emoji. No random stock kids' photos.

## Evidence on Hand

Spec PDF + 26 screenshots of a prior prototype (visual anti-reference). Welcome text (spec §41). No real testimonials, prices beyond spec §40 placeholders, or customer photos — do not fabricate.

## Product Principles

1. Each role sees a different, personal product — not one admin UI with things hidden.
2. Truth over reassurance: show pending, unverified, failed-to-send as distinct states.
3. Never lose a family's action: no double submit, no silent drop, recover the same attempt.
4. Privacy by default: minimum data per role, children's data never public.
5. Phone is the primary surface; desktop gains space, not features.

## Accessibility & Inclusion

WCAG 2.2 AA target, 44×44 touch targets, keyboard for every action, alternative to drawn signature, test widths 360/390/768/1024/1440.
