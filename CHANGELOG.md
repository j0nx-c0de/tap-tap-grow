# Changelog

A history of how Tap Loop got to its current shape — decisions and the
reasoning behind them, not just file diffs. Entries run oldest → newest, so it
reads as the story of the build. See `ROADMAP.md` for what's still open and
`README.md` for how the current system actually works.

---

## 2026-08-24 — Concept and planning

**The idea, as pitched:** a lightweight platform where a business gets an NFC
tag that signs customers up for texts/email, sends them to leave a review on
Google/Yelp/Facebook and follow on Instagram/TikTok, and rewards them for it
— sold door-to-door to small businesses, deployed fast, low-cost.

**Clarifying decisions made before any build work:**
- Review **verification** would need to support both an honor system
  (self-report) and staff-verified approval at the register — no review
  platform exposes an API to confirm a specific person posted a specific
  review, so this was always going to be a config/human decision, not
  something to automate.
- The **punch card** was called out from the start as wanting to be a
  standalone, independently sellable feature — not bolted onto the review
  flow, for businesses that want a loyalty mechanic without the review ask.
- Target model: **multi-tenant**, sold door-to-door, "very lightweight, low
  cost for the businesses," deployed quickly — one operator (the user)
  managing many small-business accounts, not a self-serve SaaS signup flow.
- **NFC tags write-on-demand** at the point of sale, not pre-printed —
  meaning tags just need to hold a stable URL; all real logic can live
  server-side and change later without re-writing the physical tag.
- Compliance (10DLC, TCPA opt-in language) explicitly deferred — "just get it
  working" for the MVP, revisit before real SMS volume.

**Spec published:** an artifact, *The Tap-to-Review Loop*, laying out the tap
→ sign-up/review/reward flow, a no-code-MVP-vs-custom-build comparison, and a
recommended sequencing (pilot fast on no-code, build custom in parallel, cut
over around business #8–12).

**Cost research:** real current pricing pulled for Twilio, Vercel, Neon,
Resend, Airtable, Softr, and Zapier, priced out at 5/25/100-business scale.
The finding that actually changed the plan: **no-code isn't the cheap option**
once white-labeling (Softr's free tier keeps "Powered by Softr" branding,
which doesn't work for a door-to-door pitch) and realistic automation volume
(Zapier task costs) are priced in — custom code ran roughly a fifth of the
cost at every scale. No-code's real advantage was speed to a first pilot, not
money. **Decision: build custom.**

---

## 2026-08-24 — Scaffold v1: three tag types

First working build. Stack: **Next.js 16** (App Router, Turbopack) +
TypeScript + Tailwind v4, **Drizzle ORM** over a **Neon** serverless Postgres,
**Twilio** for SMS and **Resend** for email (both fall back to console
logging when unconfigured, so the app runs before real credentials exist),
cookie-based HMAC session auth for admin/staff (no session table, no
NextAuth — appropriate for a single-operator admin and a handful of
PIN-gated staff consoles).

Next.js 16 has real breaking changes from older training data — read the
framework's own bundled docs before writing routes: `params`/`searchParams`
are always Promises now, `middleware.ts` is deprecated and renamed to
`proxy.ts`, Server Actions carry their own CSRF/body-size protections.

**Schema v1:** `businesses`, `tags` (`type`: signup / review / punch),
`contacts` (phone required + unique per business, email optional),
`punchCards`, `redemptions` (`kind`: reward / stamp), `events`.

**Built:**
- `/t/[tagId]` — three purpose-built screens, chosen by the tag's `type`:
  a sign-up form, a review-platform landing page (buttons filtered to
  whichever URLs the business actually configured), and a punch-card claim
  screen.
- `/staff/[businessSlug]` — PIN-gated console to approve pending
  redemptions.
- `/admin` — password-gated single-operator dashboard: create/edit
  businesses, auto-generated QR codes and tap links per tag, an add-tag flow.

**Verified before any live data existed:** build and lint clean, the actual
SQL Drizzle would generate from the schema checked by hand, and the full
auth chain (password → signed cookie → redirect → protected page) driven in
a real browser — confirmed it failed exactly where expected, at the database
call, with a clear "DATABASE_URL is not set" message instead of a crash.

---

## 2026-08-24 — GoHighLevel: considered, not built

Asked whether the SMS/email layer could run through a GoHighLevel account
instead of raw Twilio/Resend.

**Assessment:** structurally a good fit — GHL's agency-account-with-
sub-accounts model maps directly onto "one operator managing many small
businesses," it already has review-request automation (Reputation
Management) built in, and it handles A2P 10DLC registration for its users
instead of leaving that to raw Twilio compliance flows.

**Follow-up:** does the difficulty of building/maintaining the custom UI
outweigh GHL's added cost, and how would the architecture change? Conclusion:
the *code* side was already thin (`lib/sms.ts` / `lib/email.ts`, ~25 lines
each) — GHL's real value would be offloading *operational* burden (10DLC
paperwork, deliverability monitoring, opt-out compliance, per-business number
provisioning), not reducing code complexity. Two integration depths were
mapped out: a **shallow swap** (point the same two files at GHL's API
instead of Twilio/Resend, architecture otherwise unchanged) versus a **deep
integration** (GHL becomes the source of truth for contacts/opt-in state,
and its Workflow builder's delay steps solve scheduled/delayed messaging —
a real gap the custom build has never filled). Either way, the tap
resolution, reward/redemption logic, and punch card stay fully custom, since
none of that is something GHL has an equivalent for.

**No code changed as a result of this discussion** — flagged as an open
decision in `ROADMAP.md`.

---

## 2026-08-25 — First live verification, and a real bug

The user supplied a live Neon connection string. Schema pushed, a demo
business seeded ("Demo Coffee Co."), and the full v1 flow driven in a real
browser against production data for the first time: sign-up → review
landing (correctly showing only the two platforms actually configured) →
reward claim → punch claim → staff PIN unlock → approve → admin dashboard
showing accurate live counts.

**Bug found and fixed:** the tap counter was written as
`void db.update(tags).set(...)` to avoid blocking the page render on a
non-critical write. It never actually ran a query. Drizzle's query builders
are lazy — the underlying SQL only executes inside `.then()` / `await` /
`.execute()` — so `void` on an un-awaited builder just discards an inert
object without ever triggering it. Fixed by awaiting it; the write is a
single indexed update, so the latency cost is negligible. This is exactly
the class of bug that passes typecheck and lint cleanly but is silently
wrong at runtime, which is the case for actually clicking through a feature
rather than stopping at "it builds."

**Two smaller fixes from the same pass:** tag display order was unstable
(the three seeded tags share one batch insert's identical `createdAt`, since
Postgres's `now()` is transaction-scoped, not per-row) — added a stable
secondary sort; and "1 taps" now correctly pluralizes to "1 tap."

---

## 2026-08-25 — Redesign: punch card as the unifying mechanic

**The proposal:** instead of a sign-up tag, a separate review tag with a
flat one-time reward, and a separate punch-card tag, fold everything into
one mechanic — every qualifying action (a review, a social follow, a repeat
visit) earns a stamp toward one reward. This both drives the reviews the
business wants and gives repeat customers a reason to keep coming back,
rather than a review being a single flat transaction.

**The concern raised alongside it:** not forcing punch cards on businesses
that don't want that mechanic. This was resolved architecturally, not just
reassured away — "what counts as a completed activity" (a Google review, a
follow, a visit) was decoupled from "how completions get rewarded."

**The reward model went through two rounds of real-time iteration:**
1. First pass: a single `rewardStrategy` toggle (flat vs. punch card),
   simplified almost immediately to *no* separate toggle at all — the
   reasoning being that a flat one-time reward is just a punch card with
   `punchGoal = 1`, so it didn't need its own code path.
2. Then the user asked for a genuine third case: businesses that want **no
   reward at all**, just the review/follow ask — plus confirmed that "flat"
   and "punch card" needed to stay real, distinct, sellable options at the
   door, not a config trick. Landed on `rewardMode: none | flat |
   punch_card` as one setting per business — this is the shape that shipped.

**Repeat-visit stamps** got a configurable cooldown (default 60 minutes) per
business, checked against *any* existing claim for that visit — pending or
approved — specifically so a customer can't rack up several pending claims
by tapping repeatedly while waiting for one order, but can still legitimately
earn a second stamp on a genuinely separate visit later the same day.

**Opt-in visibility:** rather than gating any reward behind opting into
texts (which is gameable — someone opts in purely for a stamp and
immediately replies STOP), phone and email opt-in status now surface
together with punch-card progress in a new admin **Contacts** page.

**What changed under the hood:**
- Schema: `businesses.rewardMode`, `punchCooldownMinutes`; `redemptions`
  gained an `activity` column (`'visit'` or a one-time activity id like
  `'google_review'`, null for reward-kind rows). `tags.type` picked up a
  `'hub'` value — the old signup/review/punch values stay valid in Postgres
  (enum values can't be dropped once used) but are no longer branched on;
  every tag now renders the same page.
- `/t/[tagId]` rebuilt as one `Hub` component with three render branches
  (none / flat / punch_card) instead of three separate page components.
- New `lib/activities.ts` (the activity catalog, filtered to whichever URLs
  a business actually configured) and `lib/punch-card.ts` (a shared
  "award a stamp, and if that fills the card, issue the reward and reset
  it" helper — used by both the honor-mode instant-approve path and the
  staff console's approval action, so that decision is made in exactly one
  place instead of twice).
- Admin business form, create/update actions, business detail page, and
  staff console all updated to match; staff console now labels each pending
  item by what it's actually for ("Review us on Google," "Visit") instead of
  a generic "Stamp."

**Migration mechanics:** `drizzle-kit push`'s interactive conflict-resolution
prompts (rename-vs-drop-and-add disambiguation, a stale unique-constraint
re-check) don't work through this environment's non-TTY shell. Both schema
changes were applied as hand-written SQL directly against the live database
instead of via `push`.

**A second lint-driven fix:** cooldown/countdown display was originally
computed with `Date.now()` inside the component's render body, which trips
`react-hooks/purity` (React's render functions are expected to be pure and
idempotent; wall-clock reads aren't). Refactored so all "is this on cooldown,
and for how long" math happens server-side in the Server Actions, and the
client only ever stores and displays a precomputed number — never calls
`Date.now()` anywhere reachable from a render.

**Live re-verification**, against reset-and-reseeded demo data: claimed a
review activity and a visit stamp (both pending, staff-verified being the
default), confirmed the cooldown blocked a second visit-stamp attempt with
an accurate remaining-time message — even while the first claim was still
unapproved — approved both in the staff console, then specifically exercised
the goal-reached path by advancing a card to 9/10 stamps and claiming one
more: confirmed the reward auto-issued and the card reset to 0/10, visible
live in the new Contacts page.

---

## 2026-08-25 — Documentation pass

`CHANGELOG.md`, `README.md`, and `ROADMAP.md` written to capture the above
history and the current state, at the user's request, for continuity across
future sessions.
