# Tap Tap Grow

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
  and how far along their punch card is. Each business also records an
  **owner/manager name and phone** (email optional) — who you actually call
  about that account, distinct from that business's own customers in
  `contacts` — and the **street address** of that location. The address is
  the cross-reference: it's what separates one chain's second location from a
  competitor trading on a near-identical name. It shows under the name in the
  business list and the ⌘K palette, it's searchable alongside name and slug
  (street, city, state, ZIP), and a business whose name matches another's
  says so on its own page, listing the near-misses with their addresses.
- **`/admin/dashboard`** and **`/admin/businesses/[id]/stats`** — the
  analytics dashboard, cross-business and per-business. See below.
- **`/admin/tags`** — inventory of batch-printed hub tags with no business
  bound yet, claimed against a business at sign-up. See "Claimable tags"
  below.
- **`/owner/[businessSlug]`** — the business owner's own read-only view of
  their numbers, behind a passwordless login. See "Owner login" below.
- **`/card/[businessSlug]`** — a customer's saved link back to their own
  punch card. See "Finding your card again" below.

### Reward modes

Each business picks one `rewardMode`, set in the admin dashboard — nothing
about the tap flow itself changes; only what happens when someone completes
an activity does:

| Mode | What a customer sees | What claiming does |
|---|---|---|
| `none` | Review/follow links only | Nothing to claim — just link clicks, logged for analytics |
| `flat` | One "claim my reward" button, with the links below it | One reward, once, ever, per person — for signing up, not for doing any of the links |
| `punch_card` | A progress bar, a "stamp for this visit" button, and any follow links | Each follow and each cooldown-gated visit adds a stamp; hitting the goal auto-issues the reward and resets the card to 0. **Reviews never add a stamp** — see below |

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

### Claimable tags, and direct-to-activity tags

A hub tag's row (`tags`) doesn't have to be created bound to a business.
`/admin/tags` batch-generates *unclaimed* inventory — an id, a QR code for
`/t/[tagId]`, and a printed activation code, no business attached yet — so
you can order/print a stack ahead of time instead of one-per-business.
Tapping an unclaimed tag renders a plain "not set up yet" message rather
than a 404. At sign-up, that same activation code claims one against the
new business, from the "Tap links" section of its admin page.

Claiming is also how a tag is *re*claimed: entering the code again — on the
same business or a different one — always rebinds it, no separate "release"
step. Moving a tag from a churned business to a new one, or from one
physical spot to another, is just claiming it again; the physical sticker
never needs to be rewritten.

Claiming can also set `directActivity`: instead of the full hub, the tag
then skips straight to one review/social link (log the click, redirect) —
the single-purpose "tap to leave a Google review" product other NFC-tag
vendors sell, built on the same tag row and the same tracked-redirect logic
as the hub's own activity links (see below). Regular tags added directly
from a business's own page (not via the claim flow) can be set the same way,
via a "Point straight at" option alongside the usual label field.

### Reviews-only quick add

`/admin/businesses/quick` is a second, much shorter door into creating a
business: a name, their Google review link, and optionally the activation
code of a blank tag already in your hand. It exists because the full form at
`/admin/businesses/new` requires owner name, phone, email, street address,
reward mode, reward headline and a staff PIN before it will save — all
correct for a business running a punch card, and all far too much to type
while someone stands watching you.

What it creates is a business with `rewardMode: 'none'` and every other
column on its schema default, plus one tag with
`directActivity: 'google_review'`. A tap on that tag logs a `review_click`
event and forwards straight to Google; no hub, no sign-up, no punch card,
and nothing for the business's staff to be trained on. The slug is derived
from the name (`lib/slug.ts`) rather than asked for, with a numeric suffix
if a chain's second location takes the same one.

It is a separate server action rather than relaxed validation on the
existing one, on purpose: making those fields optional on `createBusiness`
would also let the full form save half a business.

Everything skipped can be filled in later from the business's own admin
page, which is also where the tap link and its QR code live.

#### The Google link is the whole product, so it gets checked

There is more than one Google URL for a business and only some of them open
the review composer. `lib/google-review.ts` classifies what was pasted and
the business's admin page shows a warning above its tap links when it isn't
a direct review link:

| What was pasted | Verdict |
| --- | --- |
| `search.google.com/local/writereview?placeid=…` | opens the review box |
| `g.page/r/<cid>/review` | opens the review box |
| `maps.app.goo.gl/…`, `g.co/…`, `goo.gl/…` | short link — destination isn't in the URL, so tap it once to check |
| `google.com/maps/place/…`, `maps.google.com/?cid=…` | the listing, not the review box |
| anything else | not a Google link at all |

The middle failure is the one worth catching. A Maps listing link is not
broken: it resolves, the page loads, and the tracked redirect counts the
click exactly as it would for a real review link. The customer just lands on
the business's listing and has to find "Write a review" themselves, and most
won't — so the tap numbers look fine while the review numbers don't move.
That is invisible from the metrics, which is why it is checked at the point
you'd write the URL onto a tag rather than at save time.

The check is advisory everywhere and never blocks a save. A listing link is
worse than a review link, not wrong, and standing in a doorway telling an
owner their own Google link is invalid is not a thing the software should do.

### Activities, and why a review can't earn a stamp

The catalog is Google review, Yelp review, Facebook review, Instagram follow,
and TikTok follow (`lib/activities.ts`) — a business only gets offered the
ones it's actually configured a link for. But the catalog is split by `kind`,
and the split is a compliance boundary rather than a presentational one:

- **Follows are stampable.** Each can be claimed once per contact. Rewarding
  someone for following an account is ordinary marketing; no platform
  prohibits it.
- **Reviews are never stampable.** Google's review policy bans offering
  "discounts, gifts, or monetary rewards" for a review and names loyalty
  points specifically, and the ban applies *"regardless of whether the review
  is positive or negative"* — so a sentiment-neutral stamp is still a
  violation. The penalty lands on the **business**, not the platform
  operator: removed reviews, a suspended Business Profile, or Yelp's public
  Compensated Activity Alert on their page. A product that gets a customer's
  listing flagged is worse than no product.
- **Yelp isn't even asked for.** Yelp's guidelines forbid *soliciting*
  reviews at all, incentive or not, enforced with a ranking penalty and a
  Consumer Alert. Its link is labelled "Find us on Yelp" and renders under
  its own neutral heading, never under the review ask.

`isStampableActivity` derives this from `kind` rather than storing a flag per
activity, so a new review platform added to the catalog can't quietly become
stampable. `claimActivity` validates against `stampableActivities()`, so the
boundary holds server-side even if a page rendered a claim button it
shouldn't. Review links still render, still route through the tracked
redirect, and still appear in every dashboard metric — they just don't pay.

The repeat-visit stamp is the only repeatable one, gated by
`punchCooldownMinutes` (default 60) so a customer can't rack up several
stamps tapping repeatedly while waiting for one order.

Separately from platform policy, the FTC's Rule on the Use of Consumer
Reviews and Testimonials (16 CFR 465, in force since October 2024, civil
penalties to $53,088 per violation) prohibits conditioning an incentive on a
review expressing a particular sentiment. That rule alone would permit a
disclosed, sentiment-neutral reward — the platforms are the stricter
constraint here, and they're the ones who can delete the reviews.

Every activity link points at `/r/[businessId]/[activity]`
(`app/r/[businessId]/[activity]/route.ts`), not straight at Google/Yelp/etc.
That route logs a `review_click` event server-side, then 302s to the real
destination — a same-origin hop rather than an `<a onClick>` beacon racing
the browser's navigation away from the page. The tag a customer arrived on
(if any) rides along as a `?tag=` query param so the click still attributes
back to the physical tag.

### Analytics dashboard

Admin-only for now, at `/admin/dashboard` (across every business) and
`/admin/businesses/[id]/stats` (one business) — both behind the existing
admin password, no separate login. The metrics layer (`lib/metrics.ts`)
aggregates `events`/`redemptions` directly rather than maintaining a rollup
table; fine at the current scale, worth revisiting if query volume or row
counts grow enough to make that slow.

Every headline number is shown for **7 days / 30 days / 12 months** at once,
rather than one figure behind a range switcher:

| Metric | What it counts |
|---|---|
| Total / average review taps | Clicks on a review or social-follow link, by platform (`events.type = 'review_click'`) |
| Return taps | Every verified tap of a business's punch tag, whether or not it produced a stamp (`events.type = 'punch_tap'`) |
| Punches | Stamps that actually landed (`redemptions` with `kind = 'stamp'` and `status <> 'pending'`) — always ≤ return taps |
| NFC tags | Live count of a business's hub tags plus punch tags |

**A deliberate approximation:** the two "per customer" averages (return taps
and punches) divide by a business's *total* enrolled punch-card customers,
not a window-filtered active count. A `punch_tap` event is logged the moment
a tap is verified — before anyone has identified themselves — so it never
carries a contact id, and there's no way to join it back to a specific
customer for a true per-window rate. Revisit if this stops being good enough
once businesses have real usage history to compare against.

Charts are hand-rolled SVG (no charting dependency), with a fixed color
assigned per platform's identity rather than by sort position — so Google is
always the same hue whether it's the top row this week or the bottom.

The admin section has its own light/dark toggle (top of the sidebar),
cookie-persisted and defaulting to **light** regardless of the visitor's OS
setting — independent of the rest of the app, which still follows the OS
preference the way `/t` and `/p` always have.

### Owner login

A business owner sees their own numbers at `/owner/[businessSlug]` — the
same stats the operator sees at `/admin/businesses/[id]/stats` (literally
the same component, `app/components/business-stats.tsx`), read-only, with
nothing else exposed: no customer list, no editing, no other business.

**There's no password, by design.** Identity comes from the `ownerEmail` /
`ownerPhone` already collected on every business, so there's no new
credential to forget. The sign-in screen offers whichever of the two are on
file — masked, so a public page never shows the real address — and sends
either a magic link (email, 30-minute expiry) or a 6-digit code (SMS,
10-minute expiry). Links get clicked; codes get typed. Signing in sets a
year-long cookie keyed by business id, so in practice they bookmark the URL
once and never sign in again. The link is texted/emailed automatically when
you create the business, so it reaches them without you having to remember.

Because the URL is public and the slug is guessable, both directions are
rate-limited: five sign-in requests per business per 15 minutes (an
unthrottled "text me a code" button is both a way to hammer someone's phone
and a way to spend your Twilio balance), and five wrong guesses before a
code dies. Secrets are stored as HMACs, never in the clear, and every token
is single-use.

This is deliberately separate from the staff PIN — a cashier approving
redemptions shouldn't get revenue-adjacent stats.

### Finding your card again

Tapping a tag you've used before goes **straight to your card** — no form.
The contact cookie set at identify lasts a year, so a regular is only ever
asked who they are once per business (`loadSessionHubData` in
`lib/hub-data.ts`, used by `/t/[tagId]`, `/p/[key]` and `/card/[slug]`).

Away from the shop, `/card/[businessSlug]` is the same card at a stable URL.
It's keyed on the business's slug rather than a tag id deliberately: tags are
reassignable, so a bookmarked `/t/[tagId]` could quietly start pointing at a
different business after that sticker got re-claimed. The link is included in
the welcome text/email a customer gets when they first sign up, since a
message thread is where people actually go looking for it later. Opening it
on a device with no cookie shows the identify form ("Find your card"), which
doubles as the recovery path — identifying upserts on `(business, phone)`, so
the same number lands back on the same card rather than starting a second one.

**The welcome SMS is deliberately plain ASCII.** One non-GSM-7 character (an
em dash, a curly quote) flips the whole message to UCS-2, which cuts the
segment size from 160 characters to 70 and silently doubles the cost of every
signup text.

A punch card renders as actual punch holes — `punchGoal` dots, filled to the
current count — falling back to a progress bar above 12, where a row of dots
stops being readable on a phone.

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
   database instead needs the numbered files in `drizzle/` applied in order
   (through `0006_business_address.sql`, which adds the per-location street
   address); every one of them is additive, so they're safe to run against
   data you already have. Fine for this
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
- **Business self-serve signup** — businesses can now *see* their own stats
  (see "Owner login" above), but everything still gets *created* by you:
  there's no way for a business to sign itself up, claim its own tags, or
  edit its own links. That's the remaining half of the self-serve story —
  see `ECOMMERCE-PLAN.md`.
- **Branding on the two screens that matter** — a logo mark, favicon and
  blue palette landed on the landing page, admin login and admin layout
  (`app/components/logo.tsx`), but the customer hub (`/t/[tagId]`) and the
  staff console still don't use them. Those are the two screens customers
  and staff actually look at.
- **Physical DNA tag provisioning** — the SUN verification is tested against
  NXP's published vectors and against a software chip that generates real tap
  URLs, but no actual NTAG 424 DNA tag has been written and tapped yet.
- **`flat` and `none` reward modes are untested live** — `punch_card` has
  been driven end-to-end against real data (including the goal-reached →
  reward-issued → card-reset path); the other two modes share the same
  identify/claim code paths but haven't individually been clicked through.
  `flat`'s screen was also reordered on 2026-09-07 (reward button above the
  review links rather than below), so it's had a layout change nobody has
  clicked through yet.

## Deploying

**Host: Render Starter ($7/mo, always-on), settled 2026-09-11.** The original
plan was Vercel + Neon, but the 2026-08-25 cost analysis found two problems
with it: Vercel's Hobby tier is contractually non-commercial, so it can't be
used for this regardless of price, and Vercel Pro isn't the cheapest
commercial-safe option either. Render was chosen over Railway (usage-metered
on top of a lower base) and Cloudflare Workers (cheapest, but not a Next-16
"verified adapter" per Next's own Adapter API docs, and needs `nodejs_compat`
for `lib/auth.ts`'s use of Node `crypto`). Render buys zero adapter risk and
no cold start — its own free tier sleeps after 15 minutes idle, which would
be a bad NFC-tap experience.

Nothing in the app is Vercel-specific: no `@vercel/*` packages, no KV, Blob
or Cron, and Next 16's docs say the only real requirement is a Node.js
server. So this deploys anywhere that runs Node.

`render.yaml` in the repo root defines the service. Render prompts for
`DATABASE_URL` and `ADMIN_PASSWORD` at Blueprint creation and generates
`AUTH_SECRET` itself; `NEXT_PUBLIC_APP_URL` is committed in that file because
it isn't a secret. Twilio and Resend are deliberately left unset —
`lib/sms.ts` and `lib/email.ts` log to the console instead of sending when
their keys are missing, which is what's wanted until signup texts and owner
logins are in scope.

Run the schema push once against the production database before the first
deploy. `npm run db:push` loads `.env.local`, so pass the production URL
explicitly instead:

```bash
DATABASE_URL="postgres://…prod…" npx drizzle-kit push
```

### The one thing to know about `NEXT_PUBLIC_APP_URL`

It is **inlined at build time**, not read at runtime. Next replaces every
`process.env.NEXT_PUBLIC_*` reference with a literal during `next build` —
including on the server — and the docs are explicit that "after being built,
your app will no longer respond to changes to these environment variables."

So changing the value is not enough on its own: the app has to be
**rebuilt**. Editing the variable in Render's dashboard does trigger a new
deploy, so in practice this is handled — but a config-only restart, or
promoting a prebuilt image between environments, would silently keep serving
the old domain in every QR code and tap link it generates.

#### Why the apex, and why the hostname is effectively permanent

Production is `https://meetcompass.io` — the apex, not the
`ttg.meetcompass.io` subdomain this was first stood up on.

The reason is that an NFC tag stores the **whole URL**, hostname included.
Once a tag is stuck to a counter, that hostname has to keep resolving for as
long as the tag is in the field, and there is no remote way to rewrite it —
fixing one means physically visiting the business with an NFC writer. So
every hostname ever handed out is a permanent commitment.

That rules against a subdomain named after the product. `ttg` is a product
codename; it is exactly the string you would want to retire after a rename or
a pivot, and you couldn't, because it would be sitting on hardware in other
people's shops. The apex is the one hostname that survives any rename of the
product, because it is the company rather than the product.

The costs are small and worth naming: the apex can't take a CNAME, so it
needs an A record pointing at Render's IP (or a DNS provider with
ALIAS/ANAME flattening — Cloudflare and Namecheap both do), and a future
marketing site has to live at `/` alongside the app's routes rather than
having the domain to itself. `render.yaml` declares the domain and carries
the same note.

Every `appUrl()` call site is server-side (`lib/url.ts` is only reached from
server components, server actions and the mail helpers), so the
`NEXT_PUBLIC_` prefix isn't actually required. Dropping it in favour of a
plain `APP_URL` read at runtime would make the domain switch a restart rather
than a rebuild, and would stop the domain being baked into the client bundle.
Not done yet — noted here as the cheapest available improvement to the
cutover.

Note that the "Scheduled/delayed messaging" and "Monthly emailed metrics"
items in `ROADMAP.md` both assume Vercel Cron. On Render they need a
different scheduler — a Render Cron Job hitting a route handler is the
equivalent.
