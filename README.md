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

### Activities

The claimable activities are Google review, Yelp review, Facebook review,
Instagram follow, and TikTok follow (`lib/activities.ts`) — a business only
gets offered the ones it's actually configured a link for. Each one-time
activity can only ever be claimed once per contact; the repeat-visit stamp
is the only repeatable one, gated by `punchCooldownMinutes` (default 60) so
a customer can't rack up several stamps tapping repeatedly while waiting for
one order.

### Identity

Identity is by phone number, entered explicitly on every visit (prefilled
from `localStorage` for convenience, not relied on for identity) rather than
a cookie surviving between taps on different days — this is what lets a
punch card accumulate stamps for the same person across visits without
needing an account or login.

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
2. `npm run db:push` — syncs `db/schema.ts` to your database. Fine for this
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
