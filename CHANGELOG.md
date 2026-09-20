# Changelog

A history of how Tap Tap Grow got to its current shape — decisions and the
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

---

## 2026-08-30 — Making a full punch card impossible to fake

**The question that started it:** how does a store owner or employee tell a
real, current reward from a screenshot of an old one — *without* being handed
some new system to learn?

**The reframe that decided the design:** a physical punch card's security is
not what it looks like. Anti-forgery isn't the card, it's the *punch* — a
distinctively shaped hole or a custom stamp that only the business owns.
Anti-replay is the card being taken and binned at redemption. And staff verify
nothing: they glance, count ten holes, hand over the coffee. So the bar isn't
"no device" (a hole punch is a device) — it's "nothing that needs attention,
a login, or a screen."

Two things came out of that, and both shipped.

### The hole that was actually open

`redemptionStatus` only had `pending | approved`, and `approved` was terminal.
A reward code stayed valid forever, so a screenshot of one worked as many
times as it was shown. Split into `pending | approved | redeemed`:
`approved` now means "legitimate and unspent — the customer is owed this,"
and `redeemed` is a one-way door with a `redeemedAt` timestamp.

### Option 1 — proof by motion, no hardware

Redeeming is now a deliberate, two-tap, one-way step on the customer's phone
("only tap this with staff watching"). What it turns into is a screen that
**moves**: a continuously rotating arc, a clock ticking real seconds, and a
countdown. Staff's whole job is *"is it moving?"* — a screenshot is frozen and
its clock reads the wrong time. Past the window, or on any later viewing, the
same reward renders as a red **ALREADY REDEEMED** card stamped with when it
was claimed.

The validity window is deliberately generous (ten minutes) because it is *not*
the security control — the motion is. A screenshot is dead on arrival however
long the window is, so a short window would only ever punish an honest
customer waiting on a busy staff member. That reasoning is also why the sweep
is a rotating arc rather than a progress ring: over ten minutes a progress
sweep would crawl too slowly to read as movement.

### Option 2 — an NTAG 424 DNA "punch tag"

The literal digital hole punch: a tag the business physically holds. Staff say
"tap your phone here." No console, no PIN, no device to check.

This needs DNA silicon rather than the NTAG213 stickers the hub tags use,
because a static URL is visible in the customer's own address bar the moment
they tap it — they'd own the punch forever. A DNA chip rewrites its URL every
tap with an encrypted UID + monotonic counter and a CMAC derived from keys
that are write-only on the chip. A captured URL is inert on the next tap.

SUN verification (NXP AN12196) is implemented on Node's built-in crypto in
`lib/sun.ts` — AES-CMAC isn't in the standard library, so RFC 4493 subkey
derivation and CBC-MAC are written out rather than adding a dependency for
~50 lines. Verified against all four RFC 4493 CMAC vectors and NXP's published
SUN vector before anything was wired to it.

**Design decisions inside the tap flow:**
- **Placement is the policy, not a setting.** Counter = anyone who walks in;
  behind the counter = staff decide. Same hardware, same code — so it stayed a
  deployment choice rather than becoming a toggle.
- **The tap is the approval.** A stamp from a punch tap lands `approved` even
  at a `staff_verified` business, and a reward it completes goes straight to
  "ready to redeem." Routing proven stamps back into a pending queue would
  defeat the point of handing the business a tag instead of a console.
- **The visit cooldown still applies.** A tap proves presence, not intent —
  and a customer-side tag could otherwise be tapped ten times in a row.
- **Verification and awarding are separate steps.** A tap is verified before
  anyone knows who's holding the phone; a first-time customer identifies
  themselves and *then* gets credit. `lastAwardedCounter` (distinct from
  `lastCounter`) makes that second half single-use without parking pending
  taps in their own table.
- **UID pinning.** The keys alone aren't identity, so the chip's UID is
  learned on first sight and enforced after — a second chip provisioned with
  the same keys can't stamp.

### Incidental fixes found on the way

- **A punch-card customer who filled their card and closed the page never saw
  the reward again.** The row existed; nothing surfaced it. Outstanding
  rewards now load for every reward mode, not just `flat`.
- **Approving could resurrect a redeemed reward** — the staff console guarded
  on "not already approved" rather than "still pending."
- A contact session cookie (signed, a year long) now exists, which a punch tap
  needs to know whose card to credit. `redeemReward` uses it to reject a
  mismatched contact id rather than trusting the client's copy outright.
- Two modules were pulled out of the `"use server"` actions file — everything
  exported from one is a public endpoint, and both returned a contact's name,
  stamp count and live reward code (`lib/hub-data.ts`, `lib/redeem.ts`).

**Verified against live data:** 17 assertions covering forged keys, a wrong
chip, URL replay, double-cashing one tap, the cooldown, card-fills-to-reward,
and the full redeem → spent → still-spent lifecycle. Plus an HTTP pass
confirming a genuine tap renders the identify screen and the same URL replayed
renders "That tap was already used." A software DNA chip in the harness
generates real SUN URLs, so the only untested link is physical provisioning.

---

## 2026-08-31 — Business owner contact

**The gap:** nothing in the schema recorded who to actually call about a
business's account — the `contacts` table is that business's own customers,
tapping the NFC tag to earn stamps, which is a different population entirely.

**Added `businesses.ownerName`, `ownerEmail`, `ownerPhone`** — nullable,
additive columns (`drizzle/0002_business_owner_contact.sql`), so existing rows
(the demo business) didn't need backfilling. Surfaced as a new **Business
contact** section at the top of the admin business form, shared by both
create and edit, ahead of the review/follow links. Name and phone are
required for new saves; email is optional. Phone reuses the same
`normalizePhone` / `isPlausiblePhone` helpers the customer-facing identify
flow already uses, so it's stored in the same rough E.164 shape.

**Verified against live data:** created a real business through the admin UI
with all three fields, confirmed the row landed with the phone normalized to
`+1XXXXXXXXXX`, then removed the test business.

---

## 2026-09-01 — Cross-business analytics dashboard, and an admin theming pass

**The starting ask was bigger than what shipped:** verifiable click tracking on
every outbound tap (so a customer's browser navigating away can't silently
drop the log), a way for businesses to share a pre-printed, business-agnostic
QR/NFC tag rather than needing one printed per business, and a full stats
dashboard. Rather than build all three from a guess, the architecture was
worked out first through several rounds of clarifying questions:

- The "shared QR code" ask turned out to mean **claimable generic tags** —
  batch-order tags with no business baked in, then bind one to a business at
  hand-off time (`tags.businessId` would become nullable, plus a
  `claimedAt`) — not one tag literally serving multiple businesses at once.
- Click tracking should cover **all outbound links** (review sites, social
  follows), routed through a same-origin redirect that logs server-side
  before sending the browser on, replacing the existing `<a onClick>` call
  that races the navigation it's supposed to log.
- "Total review taps" specifically means review-link clicks by platform,
  plus the same treatment for social follows (Facebook, Instagram, TikTok) —
  not raw NFC tap volume.
- The dashboard UI should be sidebar-based, default to **light** even though
  the app otherwise follows the OS dark setting, with room for AI-generated
  insights, a natural-language metric query box, and AI-drafted commentary in
  the monthly emailed report — all layered on one shared, tool-callable
  metrics layer so the model never runs arbitrary queries against the
  database.
- Mid-discussion, the user added one more metric: **NFC tag count per
  business**, since it's a proxy for how many physical touchpoints a business
  has deployed.

**What actually shipped this pass is the dashboard half** — the tracked-
redirect route, claimable tags, and the three AI features are designed (see
`ROADMAP.md`) but not built yet.

**Metric definitions, decided along the way:**
- **Return taps** = every verified tap of a business's punch tag
  (`events.type = 'punch_tap'`), regardless of whether it produced a stamp —
  this is raw re-engagement.
- **Punches** = stamps that actually landed (`redemptions` rows with
  `kind = 'stamp'` and `status <> 'pending'`) — always ≤ return taps, since a
  cooldown or a not-yet-approved claim can block one.
- **Per-customer averages** (return taps and punches) divide by a business's
  *total* enrolled punch-card customers, not a window-filtered active count —
  `punch_tap` events are logged before anyone identifies themselves (the tap
  is verified first, the customer isn't known yet), so there's no contact id
  to join a true per-window rate against. Stated as an approximation rather
  than silently baked in.
- All headline numbers are shown for **7 days / 30 days / 12 months**
  side by side, rather than one number behind a range switcher — matching how
  the metrics were originally specified.

**Built:** `lib/metrics.ts` (the shared query layer everything above reads
from — real-time aggregation over `events`/`redemptions`, no rollup table, at
this scale); `/admin/dashboard` (cross-business KPI tiles, a 30-day trend
chart, a review/follow platform breakdown, and a sortable business table);
`/admin/businesses/[id]/stats` (the same view scoped to one business); a live
NFC-tag-count figure added to the existing business admin page. Charts are
hand-rolled SVG rather than a charting dependency, following the project's
dataviz-skill conventions: a fixed hue assigned per platform's identity
(Google is always the same color, whether it's the top row or the bottom),
a hover crosshair + tooltip on the trend line, a legend for the two-series
chart.

**Sidebar + theme, replacing the old top-bar admin layout:** a persistent
sidebar (Businesses / Dashboard) and a light/dark toggle scoped to the admin
section only — cookie-persisted, defaulting to light regardless of the
visitor's OS setting, per an explicit "I do not want a dark theme by
default" request. Customer-facing `/t` and `/p` pages are untouched and keep
following the OS preference as before.

**A real bug, caught by testing in a browser rather than trusting the
build:** the first pass of the theme CSS scoped its dark/light overrides to
`:root[data-theme="dark"]` — which only matches the `<html>` element. The
toggle actually sets `data-theme` on a wrapper `<div>` inside the admin
layout, deliberately, so the rest of the app's `<html>`-level, OS-driven dark
mode stays untouched. Because of that mismatch, the override rules never
matched anything, and the dashboard rendered dark on a dark-mode system
regardless of the toggle. Fixed by switching to plain `[data-theme="..."]`
attribute selectors, which match the div directly — a same-element
declaration always wins over an inherited one, so this doesn't need a
specificity fight. A second bug from the same pass: the sidebar wasn't
`sticky`, so its toggle and logout button scrolled out of reach on any page
taller than one screen.

**Verified live in a browser** against the real dev database (Demo Coffee
Co., 34 events, 3 punch cards, one hub tag): the dashboard renders correct
windowed totals and a real trend spike, the hover crosshair/tooltip and
platform-breakdown empty state both work, the theme toggle flips the admin
shell in both directions, and — the specific regression the bug above would
have caused — the customer-facing `/t/[tagId]` hub still renders dark under
a dark-mode OS, untouched by the admin theme cookie.

---

## 2026-09-01 — Tracked-redirect route for review/social clicks

**The gap**, called out in the same day's architecture discussion above but
not built in that pass: every review/social link on the hub was a plain
`<a href={destinationUrl} onClick={() => logActivityClick(...)}>`. The click
log was a server action fired at the exact moment the browser started
navigating to Google/Yelp/etc — a fire-and-forget call racing the tab's own
navigation away from the page, with no guarantee it finished first.

**Added `/r/[businessId]/[activity]`** (`app/r/[businessId]/[activity]/
route.ts`) — every activity link now points here instead of the destination
directly. The route looks up the business, validates the activity against
`availableActivities` (also rejecting anything the business hasn't
configured a URL for), inserts the `review_click` event, and only then
302s to the real destination — logging happens server-side, ahead of the
redirect, so there's nothing left to race. The tag a customer arrived on
(`tagId`, already threaded through the old `onClick` call) now rides along
as a `?tag=` query param instead, so attribution back to the physical tag is
unchanged. `lib/activities.ts` gained `activityRedirectPath()` to build that
link; the old `logActivityClick` server action is gone along with the
`onClick` handler that called it.

**Verified against the running dev server**: `curl`ed the route directly —
a configured activity 302s to its real destination and inserts a matching
`events` row (`platform` set, `tagId` set when `?tag=` is a valid uuid and
null otherwise); an unconfigured activity, an unknown business, and a
malformed business id all 404 instead of leaking a redirect. Test rows were
deleted afterward to keep the demo database's documented counts accurate.

---

## 2026-09-02 — Claimable tags and direct-to-activity tags

**The ask, in two parts:** a dedicated "tap to leave a Google review" tag
that skips the hub entirely (the single-purpose product other NFC-tag
vendors sell), and a way to order/print tags in bulk *before* knowing which
business each one will end up on — bind ("claim") one to a business at
sign-up instead, and be able to re-claim the same physical sticker to a
different business later with zero hardware rewriting. This generalizes the
"Claimable generic NFC tags" idea sketched in `ROADMAP.md` on 2026-09-01.

**Schema (`drizzle/0004_claimable_tags.sql`):** `tags.businessId` is now
nullable — a tag can exist as unclaimed inventory. Three new nullable
columns: `claimedAt` (set on each claim/re-claim), `activationCode` (a
human-typed, unique credential every tag gets at creation, not just batch
inventory — `lib/codes.ts`'s `generateTagActivationCode`, same unambiguous
alphabet as redemption codes), and `directActivity` (validated against
`ActivityId` in application code, not a DB enum, the same precedent as
`redemptions.activity`).

**`app/t/[tagId]/page.tsx` restructured** from one inner join into two
lookups, so an unclaimed tag renders "This tag isn't set up yet" instead of
a bare 404, and a claimed tag with `directActivity` set logs the click and
redirects straight to that activity's URL (falling back to the normal hub
if the business no longer has a URL configured for it — config can change
after a tag was claimed). The click-logging + activity-validation step is
now shared (`lib/activities.ts`'s `logReviewClick`) between this path and
the `/r/[businessId]/[activity]` route from the day before, rather than
duplicating the lookup — only the actual redirect mechanism differs
(`next/navigation`'s `redirect()` vs. `NextResponse.redirect`).

**Admin:** a new `/admin/tags` page (`lib/tags.ts`'s `loadUnclaimedTags`)
lists unclaimed inventory with QR codes and activation codes to print, plus
a "generate N" form. A business's own page gained a "Claim a tag" form
(activation code + an optional "point straight at" activity) — claiming is
always allowed regardless of a tag's current state, so re-claiming a tag
already on this business (just to flip `directActivity`) and moving a tag
over from a different business both go through the same `claimTag` action,
with no separate "release" step first. The existing "Add tag" form gained
the same "point straight at" option for the instant, non-batch path.
Claimed tags now show their activation code too (a `<details>` disclosure,
matching the punch-tag card's AES-key pattern) — without that, a lost
printed slip would make a claimed tag permanently unreassignable from the
UI. `lib/metrics.ts`'s tag-count queries now exclude unclaimed inventory
from "NFC tags deployed."

**A live-editing collision, caught mid-implementation:** partway through, a
concurrent session editing this same repo had already reactively patched
`lib/metrics.ts`'s `loadBusinessRollup` to keep it type-correct against the
schema change (Drizzle doesn't narrow a column's inferred type on a `WHERE`
clause, so `tags.businessId` going nullable broke that function's typing
the moment the schema edit landed) — confirmed compatible with the planned
fix and completed the matching change in `tagCount()`, the one call site it
hadn't reached yet, rather than overwriting it.

**A real dev-server casualty, unrelated to this feature's logic:** the
long-running dev server (up since earlier the same day, hot-reloading
continuously across two concurrent editing sessions) degraded into a
Turbopack worker-pool crash loop mid-verification — `Jest worker
encountered 2 child process exceptions, exceeding retry limit`, plus a
couple of `uncaughtException: EPIPE` crashes. Every route degraded, not
just the new ones, confirming it wasn't a code bug. Restarted clean and
re-verified everything against the fresh process.

**Verified live, end to end, in a real browser** (not just curl): logged
into `/admin`, generated unclaimed tags on `/admin/tags`, claimed one
against the demo business pointed at Google review and another at Yelp
through the actual claim form, confirmed both tags' tap URLs 307-redirect
to the right destination with a logged `review_click` event, confirmed a
plain claimed tag still renders the hub and an unclaimed one renders the
new "not set up yet" message, and confirmed `/admin/dashboard`'s "NFC tags
in the field" figure (4) correctly excluded the still-unclaimed inventory
(2) sitting alongside it. All test tags and events deleted afterward.

---

## 2026-09-02 — Passwordless business-owner login

**The ask:** let a business see its own numbers, with as little friction as
possible — explicitly *not* "another login and password they'll forget."

**No password at all, then.** Identity comes from the `ownerEmail` /
`ownerPhone` already collected on every business at sign-up, so there's no
new credential and no new signup step. `/owner/[businessSlug]` (mirroring
`/staff/[businessSlug]`) offers whichever contact methods are on file and
sends either a magic link by email or a 6-digit code by SMS — the two
channels want different mechanisms, since carriers and messaging apps
mangle links, and a typed numeric code is the pattern everyone already
trusts from bank 2FA. Both land on the same signed cookie, keyed by
business id rather than slug so an admin rename doesn't sign anyone out,
and lasting a year: the goal is that they bookmark it once and never think
about signing in again. The link is auto-sent when you create the business,
so it reaches the owner without depending on you to pass it along.

**This also settles a question `ROADMAP.md` had been sitting on** — whether
owner access should ride on the existing staff PIN. It shouldn't: a cashier
approving redemptions has no business seeing revenue-adjacent stats, so
this is its own credential.

**Scope is deliberately read-only (stats only)** — no customer list, no
editing links or reward config. Discussed explicitly: reads are cheap and
safe, writes carry the support burden (an owner pasting a broken Google URL
silently breaks their live tags, and the "my QR doesn't work" call comes to
you). Worth recording that "stats only" was *not* about withholding data —
"you own your customer list" is a better pitch than hiding it — it was about
proving the auth before widening the surface. The write half and the
customer-list question are now product decisions in `ROADMAP.md`.

**Abuse hardening, because the URL is public and the slug is guessable:**
five sign-in requests per business per 15 minutes (an unthrottled "text me
a code" button is simultaneously a way to hammer an owner's phone and a way
to spend the platform's Twilio balance), and five wrong guesses before a
code is retired — a million-space code with unlimited attempts wouldn't
hold. Secrets are stored as HMACs under `AUTH_SECRET`, never in the clear,
and every token is single-use. Destinations are masked on the sign-in page
(`j•••@gmail.com`) so a public URL never reveals the real address.

**Two things worth noting for whoever reads this next:**
- The emailed magic link needs a **route handler**, not a page — a cookie
  can't be set during a Server Component render, and setting the session is
  the entire job of that endpoint. (A suspected second gotcha — that cookies
  set via `next/headers` don't attach to a hand-constructed
  `NextResponse.redirect` — turned out *not* to apply here; verified by
  inspecting the actual `Set-Cookie` header on the 303.)
- The console fallbacks in `sendEmail`/`sendSms` log recipient and subject
  but never the body, and only a hash of each secret reaches the database —
  so with no Twilio/Resend credentials the link or code would exist nowhere
  recoverable. `lib/owner-login.ts` logs it explicitly when the send comes
  back `simulated`, which is what makes local testing possible at all and
  can't fire once real credentials are set.

**Refactor that came with it:** the admin per-business stats page and the
owner page render the same figures, so the composition moved into
`app/components/business-stats.tsx` and the three presentational pieces
(`charts`, `kpi-tile`, `period-selector`) moved out of the admin route group
into `app/components/metrics/` — a public-facing page reaching into
`app/admin/(protected)/` would have worked but read wrong. Both pages are
now thin wrappers; the admin view was re-checked and renders unchanged.

**Verified live in a browser**, both channels end to end: SMS code signs in;
five wrong codes lock the token and the *correct* code is then refused too;
a fresh code works; the magic link signs in and the same link reused lands
back on sign-in with "already used or expired"; the 6th request in a window
is throttled; sign-out returns to sign-in; the 7D/30D/12M selector works
under `/owner/[slug]`. Creating a throwaway business confirmed the welcome
SMS *and* email both fire (best-effort, wrapped so a send failure can't
turn a committed creation into an error page) and that the link they carry
signs in. Throwaway business and all login tokens deleted afterward; the
demo business kept placeholder owner contact details, now also in
`db/seed.ts` so a fresh seed can exercise this.

---

## 2026-09-02 — Business address, as the thing that tells look-alikes apart

**The ask, and what it's really for:** every business records a street
address alongside its owner contact details — not for mailing anything, but
as a **cross reference**. Two rows called "Joe's Pizza" are either one
chain's second location or a competitor trading on a near-identical name,
and the name alone can't tell you which. The address can.

**Stored as parts, not a blob.** `address_line1`, `address_line2`, `city`,
`state`, `postal_code` on `businesses` (`drizzle/0006_business_address.sql`,
additive and nullable like the owner-contact columns before it). One text
field would have been less typing, but the whole point is showing and
matching on *city* — a blob makes "Springfield, IL" a substring search
instead of a value, and makes the one-line list label impossible to shorten
sensibly. Street, city, state, and ZIP are required on save; suite/unit is
optional. State normalizes to a two-letter code in the server action so "il",
"IL", and "Il" can't become three spellings of one place.

**Where it shows up** — all of it in the admin surfaces, none of it
customer-facing (a customer tapping a tag is standing in the shop; they know
where they are):
- The business list shows the address directly under the name, since that's
  the pair you read together when two rows look alike.
- Search now matches street, city, state, and ZIP alongside name and slug,
  and the box says so. "Which Joe's is the one on Main St?" is now a query.
- The ⌘K palette carries the address in each business's sublabel, which the
  existing `keywords` ranking already searches — typing a city jumps to the
  business for free.
- The business's own page shows the full address as a Google Maps link, and
  **lists other businesses whose name matches or nearly matches**, each with
  its address. That comparison is normalized (case, punctuation, and
  `the/a/llc/inc/co/company/corp` dropped) and runs in JS over the business
  list rather than in SQL — no index could serve it, and this is one
  operator's door-to-door book, not a public directory.

**Formatting lives in `lib/address.ts`**, shaped around where it's shown
rather than around the data: `formatAddressLine` for a list row or palette
sublabel (suite dropped — it never distinguishes two businesses and the row
is narrow), `formatAddress` for the full block, `formatLocality` for the
"Springfield, IL 62704" half, and `mapsUrl`. Rows created before this
existed render as "No address on file" rather than an empty gap.

**Verified live:** the migration applied to the dev database; the list, the
search (by city, ZIP, and street), the palette, and the detail page all
render the address; a throwaway "Demo Coffee Company" in a different city
produced the matching-name block on both rows and was deleted afterward.
Saving the settings form with a lowercase `il` stored `IL`, confirming the
normalization goes through the real server action and that an update writes
the address rather than nulling it. The demo business in `db/seed.ts` now
carries a placeholder address so a fresh seed exercises this too.

---

## 2026-09-03 — The customer side: stop re-asking, and give the card a home

**Prompted by a plain question — "how does a customer track their punch
card?"** — which turned out to have an uncomfortable answer: by standing in
the shop and tapping the tag, and no other way at all.

**Two gaps, both found by reading rather than guessing:**

1. **`/t/[tagId]` re-asked who you were on every single tap.** `/p/[key]`
   had always read the contact cookie and gone straight to the card for a
   returning customer; the hub tag — the one nearly every customer actually
   taps — never did. The phone prefilled from `localStorage`, so it was one
   "Continue" tap, but it was still a form standing between a regular and
   their own card, every visit, with the cookie already set and `loadHubData`
   already written.
2. **There was no way back to the card at all.** No bookmarkable URL had ever
   been handed out, and the welcome text was literally *"Thanks for visiting
   X! Reply STOP to opt out."* — no link in it. "How many stamps do I have?"
   was unanswerable from the couch, which is exactly where it gets asked.

**Fixed by pulling the session lookup into `loadSessionHubData`**
(`lib/hub-data.ts`) — cookie → contact scoped to that business → hub data, or
null — and using it from both `/t/[tagId]` and the new `/card/[businessSlug]`.

**`/card/[businessSlug]` is the customer's saved link to their own card.**
Keyed on the business slug rather than a tag id on purpose: tags became
reassignable last week, so a bookmarked `/t/[tagId]` could quietly start
showing a *different* business's card once that sticker was re-claimed. With
no cookie it falls back to the ordinary identify form (re-worded to "Find
your card" via a new optional copy override on `Hub`), which doubles as the
cross-device recovery path — identifying upserts on `(business, phone)`, so
the same number returns the same card instead of starting a second one. No
bearer tokens; it reuses the identity model already documented in the README.
The link now rides in the welcome SMS and email, because a message thread is
where people actually look for something like this later.

**A cost bug caught in its own verification.** The first draft of that SMS
read `... {url} — reply STOP to opt out.` The em dash isn't in GSM-7, and a
single non-GSM-7 character flips the entire message to UCS-2, dropping the
segment size from 160 characters to 70 — turning every signup text into two
billed segments for the sake of one dash. Now plain ASCII, with a comment
saying why so it doesn't creep back in.

**The punch card also looks like one now:** `punchGoal` dots filled to the
current stamp count, instead of a progress bar. Above 12 stamps it falls back
to the bar, since a row of 50 dots (the schema's max) is unreadable on a
phone. The dots are `aria-hidden` — the existing "4 of 10 stamps" line is
what gets announced, rather than repeating the same fact twice.

**Apple/Google Wallet passes were considered and deliberately shelved** until
this proves itself with a real business — see `ROADMAP.md` for what that
would actually cost. Worth noting the web card makes the question answerable:
`/card/[slug]` is a distinct URL, so "do customers ever come back to it" is
now measurable rather than assumed.

**Verified in a browser end to end:** signed up as a fresh number on
`/card/demo-coffee`, confirmed the welcome SMS carried the card URL, then
loaded the *tag* URL and landed straight on the card with no form — the
returning-customer path and the card link proven in the same pass. Dots
rendered filled 4-of-10 against a seeded stamp count, and raising `punchGoal`
to 20 correctly fell back to the bar. Test contact, its punch card,
redemptions and events deleted afterward, and `punchGoal` restored to 10.

---

## 2026-09-04 — Pricing and exit model, with two code findings

No code changed. Recorded here because it produced a price, a target, and
two gaps in the codebase that nothing else was tracking.

**The question:** how many businesses and customers would it take to sell
this, and what should it cost per business to reach an eight-figure exit.

**The price: a $79 / $149 / $249 ladder, leading with $149**, plus a $199
one-time setup fee. The market has a gap exactly there. Square Loyalty is
$45/mo but is points-only — no digital punch card — and only works inside
Square's POS. Birdeye starts around $299 and Podium around $399, and both do
reviews without any loyalty mechanic. So a business that wants both jobs done
pays roughly $344/mo today, which makes $149 a line you can say at a counter.
At $99 you argue about price against Square; at $149 you argue about value
against Birdeye. The setup fee exists less for the hardware cost than because
a business that paid to start churns less.

**The target: roughly 1,400 active businesses** (~$2.5M ARR at that blended
price, $10M at a 4× multiple), or ~700,000 enrolled consumers at ~500 per
mature business. But the useful finding was that the count barely matters
next to the multiple — the same $10M needs 1,896 businesses at 3× or 569 at
10×, and what sets the multiple is structural, not sales effort.

**A hard constraint fell out of the churn arithmetic.** A subscription book
converges on a ceiling of monthly-adds ÷ monthly-churn regardless of how long
it runs. At a solo pace of ~20 closes/month against 3% monthly churn the
ceiling is 667 businesses — it never reaches 1,400, at any point, ever. Six
reps reach it in about 30 months. Also worth keeping: halving churn cuts 36
months off the four-rep timeline, nearly twice what two more reps buy. Fixing
retention beats hiring, and it raises the multiple at the same time.

**Two things the code doesn't have, found while checking the claims:** there
is no billing system of any kind, and consent is stored as a bare boolean
with no evidence attached. Both are now tracked in `ROADMAP.md` under
"Before a real business goes live" — they were previously in neither doc.

---

## 2026-09-05 — Embedded payments: routes priced, and one ruled out

Follow-on question: how to actually get payments, and whether to become a
processor. Again no code, but it changes what gets built next.

**The blocker is product, not plumbing.** Tap Tap Grow doesn't touch the
transaction — the tag sits *next to* the register while the customer pays on
the merchant's own Square, Toast or Clover terminal. Embedded payments isn't
a module to bolt on; every route below is really a different answer to "how
do we get into the payment flow at all."

**Route A, referral/ISO:** recommend a processor, take a share of residuals.
Weeks, no code, no risk, nets ~20 bps of volume. Worth signing now — not for
the money, but because it measures the real attach rate before anything is
spent on Route B. A buyer values it near zero: not contracted, terminable.

**Route B, PayFac-as-a-Service — the answer.** Stripe Connect (days to
weeks), or Finix/Payrix (weeks to months, better buy rate). A provider gives
a wholesale rate, you set retail and keep the spread. Finix publishes roughly
interchange + 0.40% + 8¢ card-present from about $250/mo. Platforms net
30–100 bps; nearly half of vertical SaaS clear 90. At 35% attach that's
~$1.1M/yr on $147M of volume.

**Route C, registered PayFac — ruled out.** $500K–$5M and 12–18 months before
the first sub-merchant, a sponsor bank that takes 3–6 months and underwrites
*you*, $75–100K/yr ongoing compliance, and chargeback and merchant-fraud risk
onto the balance sheet. Only pays back above ~$50M of annual volume, and even
at 1,400 businesses the extra ~40 bps over Route B is $588K/yr against a
$1.5M build — a three-year payback *before* pricing the risk.

**The step ahead of all three: integrate with Square, Toast and Clover.** It
earns no payment revenue and it's still the highest-value item. It makes
stamps land automatically on a real purchase, which is the thing
`redemptionMode`'s honor/staff_verified toggle exists to paper over; it gets
the transaction data that one-tap pay-and-stamp needs anyway; those
marketplaces are where merchants already shop for loyalty apps (Clover pays
70% royalties on App Market subscriptions); and it means never opening with
"switch your payment processor," which is the hardest sale in SMB software.

**Why it matters to the number:** payments doesn't add to the plan so much as
replace most of it. Revenue per business rises ~45% *and* the multiple moves
from 4–8× into 6–14×, and those compound — ~1,422 businesses at 4× becomes
~561 at 7×. The second is a company a small team can actually reach.
---

## 2026-09-07 — A review can no longer earn a punch

**The flaw:** the punch card awarded a stamp for `google_review`,
`yelp_review` and `facebook_review` exactly as it did for a follow or a
visit. The intuition behind it was that a punch isn't a payout — it's
indirect, non-monetary, and awarded regardless of what the review said. All
three of those are specifically the loopholes the platforms wrote language
to close.

**What the policies actually say.** Google prohibits "discounts, gifts, or
monetary rewards" for a review and names **loyalty points** explicitly, and
the ban applies *"regardless of whether the review is positive or
negative"* — the sentiment-neutral defence doesn't survive contact with the
text. Google tightened the wording in February 2026, again in April 2026,
and now actively surveys users about whether a business offers incentives.
Yelp is stricter still: it forbids *asking* for reviews at all, incentive or
not, and enforces with a ranking penalty, a Consumer Alert, and — where it
has evidence of incentives — a Compensated Activity Alert on the business's
page.

**Why this mattered more than a typical terms-of-service risk:** the penalty
lands on the *customer*, not on us. A removed review set, a suspended
Business Profile, or a public banner saying the business paid for reviews is
materially worse than never having run the program. The product was
generating a liability for the businesses it was sold to.

**The FTC layer is the more permissive one,** which is worth recording
because it's counter-intuitive. 16 CFR 465 (in force since October 2024,
penalties to $53,088 per violation) bans *conditioning* an incentive on a
particular sentiment, not incentives as such — a disclosed, sentiment-neutral
reward is inside that rule. The platforms are the binding constraint, and
they're the ones who can delete the reviews.

**The fix, and where the boundary lives.** `ACTIVITY_CATALOG` now carries a
`kind` of `review` or `follow`, and `isStampableActivity` derives
stampability from it rather than storing a per-activity flag — so a new
review platform added later can't quietly become claimable. `claimActivity`
validates against `stampableActivities()` instead of `availableActivities()`,
which makes the server the boundary: a review id is rejected regardless of
what the page rendered. Review links still render, still route through
`/r/[businessId]/[activity]`, and still feed every dashboard metric — they
just don't pay.

Yelp additionally carries `solicitable: false`, which relabels it "Find us on
Yelp" and moves it out from under the review ask into its own neutral "Find
us online" heading. Asking is the violation there, not just rewarding.

**Two UI consequences beyond deleting a button.** The punch-card screen's
"Also earn a stamp by:" list is now follows only, with reviews in a separate
block below a rule, headed "Enjoying {business}? A review helps other people
find us" — an ask with nothing attached to it. And `flat` mode's button was
"I did this — claim my reward" sitting directly under the review links, which
read as a conditional offer even though the code never checked; the reward is
for signing up, so the button now says "Claim my reward" and renders *above*
the links rather than below them. Order was doing argumentative work here.

**What this doesn't change:** the visit stamp, follows, direct-to-activity
tags (a tag pointing straight at a Google review with no reward attached was
always fine, and is the commodity product other vendors sell), and every
analytics path. `redemptionMode`'s honor/staff_verified toggle stays too,
though note its original justification — that no platform exposes an API to
confirm a review was posted — no longer applies to reviews at all. What it
now verifies is that a visit really happened.

**Not migrated:** `redemptions` rows written before today may still carry a
review activity. They're historical fact and are left alone; `hub-data.ts`
reads `completedActivityIds` from them, and a review id there simply matches
nothing rendered any more.

**Verified:** typecheck, lint and a production build all clean.

---

## 2026-09-11 — Renamed to Tap Tap Grow, and a temp domain

**The rename.** "Tap Loop" was already owned, so the product is now **Tap Tap
Grow**. The swap touched ten strings across seven files plus the wordmark in
`app/components/logo.tsx`, which splits `TAP TAP` / `GROW` the same way it
split `TAP` / `LOOP`. The mark itself — the three signal arcs over a dot — is
unchanged and needed no change: it reads as a tap, not as a loop, so it
survives the rename intact.

**What the name search turned up.** No company trades as Tap Tap Grow: no
site, no LinkedIn company page, nothing in the NFC-review space.
`taptapgrow.com` has been registered since September 2011 but serves no
website — held, not used — while `.io`, `.co`, `.app`, `.net` and `.us` are
all unregistered.

**The one real caution, recorded because it won't show up in a domain
check.** `tapforgrowth.com` sells almost exactly this product — an NFC review
set plus a "reputation portal", pitched at local businesses wanting more
Google reviews. Trademark conflict turns on similar marks for *related*
goods, so a near-synonymous name in an identical category is the kind of
neighbour that matters, where the Oregon preschool at `tiptapgrow.com` (one
vowel away, completely different field) is not. Nothing here is a legal
opinion and no TESS search was run — this is a preliminary screen, and the
decision to keep the name was made with that caveat understood.

**Temp domain.** The tracker will stand up at `ttg.meetcompass.io` before the
permanent domain is bought. This is safe because the tag id, not the origin,
is the identity: every sticker encodes `/t/{tagId}` and resolves by UUID, so
a path-preserving 301 from the temp domain keeps every tag already in the
field working. `NEXT_PUBLIC_APP_URL` is the only thing that binds the app to
a domain (`lib/url.ts`, `db/seed.ts`); no cookie sets a `domain` attribute,
so the move costs one admin re-login and nothing else. The single
irreversible artifact is a printed QR code, so none get printed until the
permanent domain exists.

**Host settled:** Render, per the 2026-08-25 cost analysis — Vercel Hobby is
contractually non-commercial and Cloudflare Workers isn't a Next 16 verified
adapter.

**Verified:** typecheck, lint and a production build all clean.
