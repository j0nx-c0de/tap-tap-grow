# Tap Loop

NFC tap → sign-up, review/follow requests, and a punch-card reward loop for
local businesses. One physical tag resolves to `/t/[tagId]`, which looks up
the business it belongs to and renders the same hub page for everyone — no
app install, no per-business site to maintain, no distinction between
"sign-up tag" and "review tag" anymore.

For how this got here, see `CHANGELOG.md`. For what's still open, see
`ROADMAP.md`.

## How it fits together

- **`/t/[tagId]`** — the only URL that ever gets written to a physical tag.
  Looks up the tag's business and renders one hub: identify yourself (name,
  phone, email, opt-ins), then earn toward that business's reward however
  it's configured.
- **`/staff/[businessSlug]`** — PIN-gated console where staff approve
  pending redemptions (a reward or a stamp) at the register. Each pending
  item is labeled by what it's actually for — "Review us on Google," "Visit"
  — not a generic "Stamp."
- **`/admin`** — single-operator dashboard (you) for creating businesses,
  editing their reward config, generating tap links + QR codes to write to
  tags, and a per-business **Contacts** page showing who's opted into what
  and how far along their punch card is.

### Reward modes

Each business picks one `rewardMode`, set in the admin dashboard — nothing
about the tap flow itself changes; only what happens when someone completes
an activity does:

| Mode | What a customer sees | What claiming does |
|---|---|---|
| `none` | Review/follow links only | Nothing to claim — just link clicks, logged for analytics |
| `flat` | Links + one "claim my reward" button | One reward, once, ever, per person |
| `punch_card` | A progress bar, each link earning its own stamp, plus a "stamp for this visit" button | Each one-time activity and each cooldown-gated visit adds a stamp; hitting the goal auto-issues the reward and resets the card to 0 |

A business that wants the old "leave a review, get 10% off, done" behavior
is just `flat` — there's no separate code path for it, and no business is
pushed toward the punch-card mechanic if they don't want it.

### Redeeming, and why a screenshot doesn't work

A reward moves through three states: `pending` (staff still need to confirm
the claim behind it), `approved` (legitimate and unspent — the customer is
owed this), and `redeemed`, which is a one-way door with a timestamp.

Redeeming is a deliberate two-tap step on the customer's phone, and what it
produces is a screen that **moves** — a rotating sweep, a clock ticking real
seconds, a countdown. Staff have one job: *is it moving?* A screenshot is
frozen and its clock is wrong. Any later viewing of the same reward renders a
red **ALREADY REDEEMED** card stamped with when it was claimed, so there's
nothing to compare and no date arithmetic to do.

The ten-minute window isn't the security control — the motion is. A screenshot
fails regardless of how long the window is, so a short one would only punish a
customer waiting on busy staff.

### Punch tags (NTAG 424 DNA)

Optional, and the closest thing to handing a business back its hole punch. A
punch tag is a tag the business physically keeps; staff say "tap your phone
here." No console, no PIN, no device to check. Generate one per business in
admin, which mints the two AES-128 keys to provision onto the chip.

This needs DNA silicon rather than the cheap NTAG213 stickers the hub tags
use. A static URL is visible in the customer's address bar the instant they
tap it, so they'd own the punch forever. A DNA chip rewrites its URL on every
tap with an encrypted UID, a monotonic counter, and a CMAC derived from keys
that can't be read back off the chip — a captured URL is inert on the next
tap. Verification lives in `lib/sun.ts` (NXP AN12196, on Node's built-in
crypto).

**Where the business sticks it is the policy** — there's no setting for this.
On the counter means anyone who walks in earns a stamp; behind the counter
means staff decide who gets one. Same hardware either way.

A tap counts as a verified visit stamp, so it's subject to the same
`punchCooldownMinutes` as any other visit, and it lands `approved` even at a
`staff_verified` business — the tap *is* the approval, which is the whole
point of handing them a tag instead of a console.

### Activities

The claimable activities are Google review, Yelp review, Facebook review,
Instagram follow, and TikTok follow (`lib/activities.ts`) — a business only
gets offered the ones it's actually configured a link for. Each one-time
activity can only ever be claimed once per contact; the repeat-visit stamp
is the only repeatable one, gated by `punchCooldownMinutes` (default 60) so
a customer can't rack up several stamps tapping repeatedly while waiting for
one order.

### Identity

Identity is by phone number, entered explicitly on the hub (prefilled from
`localStorage` for convenience) — this is what lets a punch card accumulate
stamps for the same person across visits without needing an account or login.

Identifying also sets a signed, year-long contact cookie. That exists for
punch tags specifically: a tap lands on a URL that knows nothing about who's
holding the phone, and making someone re-type their number at the counter
would defeat the point of a one-tap stamp. It's a convenience credential for a
loyalty card, not a login — worst case someone else's phone earns a stamp, and
every reward it leads to is still gated behind the redemption step.

**Redemption verification is a config toggle per business**
(`redemptionMode`: `honor` vs `staff_verified`), not a fixed choice — no
review platform exposes an API to confirm a specific person posted a
specific review, so this is deliberately a human/config decision, applied
uniformly to every stamp and reward a business issues.

## Setup

1. `cp .env.example .env.local` and fill in at minimum `DATABASE_URL` (a
   free [Neon](https://neon.tech) Postgres works well), `ADMIN_PASSWORD`,
   and `AUTH_SECRET` (generate with the command in the example file).
   Twilio and Resend are optional locally — without them, messages are
   logged to the console instead of sent.
2. `npm run db:push` — syncs `db/schema.ts` to your database. An existing
   database also needs `drizzle/0001_verifiable_redemption.sql` applied (the
   `redeemed` status, `redeemed_at`, and the `punch_tags` table); it's
   additive, so it's safe to run against data you already have. Fine for this
   stage; switch to `npm run db:generate` + versioned migrations once real
   customer data exists that you can't casually reset. Note: `push`'s
   interactive rename/conflict prompts don't work in every shell — if it
   hangs asking a question, apply the equivalent `ALTER TABLE` by hand
   instead (see the migration notes in `CHANGELOG.md` for examples).
3. `npm run db:seed` — creates a demo business and prints its tap link.
4. `npm run dev`, then open the seeded `/t/[tagId]` link.

To test an actual NFC tap end-to-end you need the dev server reachable from
a phone (e.g. via a tunnel like `ngrok http 3000`, or just deploy to Vercel
and test against that). Write a tag's URL with any free "NFC Tools" style
app — the tags are dumb; all the logic lives server-side, so re-pointing
what a tag does later never requires touching the physical sticker again.

## What's stubbed or deliberately left out

- **Scheduled/delayed messaging** — the welcome text sends immediately on
  identify; there's no "wait N hours, then nudge them for a review" flow. A
  real version needs a scheduled job (Vercel Cron hitting a route handler,
  or a GHL Workflow if that integration happens — see `ROADMAP.md`), not
  just app code.
- **10DLC registration** — required before sending real SMS volume through
  Twilio. Not something this codebase can do for you.
- **Business self-service login** — `/admin` is single-operator by design,
  since you're configuring each business yourself at the point of sale. Add
  per-business accounts later if businesses start wanting to self-manage.
- **Landing page branding** — the hub page is clean but generic. Worth a
  real design pass once the flow is validated with real businesses.
- **Physical DNA tag provisioning** — the SUN verification is tested against
  NXP's published vectors and against a software chip that generates real tap
  URLs, but no actual NTAG 424 DNA tag has been written and tapped yet.
- **`flat` and `none` reward modes are untested live** — `punch_card` has
  been driven end-to-end against real data (including the goal-reached →
  reward-issued → card-reset path); the other two modes share the same
  identify/claim code paths but haven't individually been clicked through.

## Deploying

Vercel + Neon is the intended target (matches the cost breakdown behind the
decision to build custom in the first place — see `CHANGELOG.md`). Set the
same env vars from `.env.local` in the Vercel project settings, run
`db:push` (or the hand-written SQL equivalent) against the production
`DATABASE_URL` once, and set `NEXT_PUBLIC_APP_URL` to the real deployed
domain so generated QR codes and tap links point at production, not
localhost.
