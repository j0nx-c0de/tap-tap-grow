# Roadmap

What's left, grouped by how blocking it is. See `CHANGELOG.md` for how the
product got to its current shape and the reasoning behind decisions already
made; this file is only the forward-looking half.

## Before a real business goes live

- **10DLC registration.** Twilio will start filtering SMS as unregistered
  traffic once volume ticks up. Not something this codebase can do — a
  manual step with Twilio (or handled by GHL, if that integration happens;
  see below) before texting real customers at any scale.
- **Real Twilio/Resend credentials, verified live.** Everything so far has
  run against the console-log fallback (`.env.local` left blank). The send
  path itself (`lib/sms.ts`, `lib/email.ts`) is simple, but it's never
  actually sent a message.
- **Re-check the review-incentive rules before launch, and then on a
  schedule.** The stamp-for-a-review mechanic was removed on 2026-09-07 (see
  `CHANGELOG.md`) because Google bans rewarding reviews outright and Yelp
  bans even asking. Both policies moved twice in 2026 already. This is worth
  a look before the first real business goes live and worth folding into the
  scheduled link-health agent below once that exists — the agent is already
  going to be walking every business's review links, and "is this still
  compliant" is the same pass as "does this still work."
- **`flat` and `none` reward modes, live-tested.** `punch_card` has been
  driven end-to-end against real data, including the goal-reached →
  reward-issued → reset path. The other two modes share the same
  identify/claim infrastructure but haven't individually been clicked
  through against live data.
- **There is no billing system.** Nothing in the codebase charges anyone:
  no Stripe dependency in `package.json`, and no subscription, plan, price
  or invoice table in `db/schema.ts`. Revenue would be collected by hand.
  Beyond the obvious, this is what blocks ever producing a cohort retention
  curve, a churn rate, an MRR movement report or a dunning flow for failed
  cards — and those are exactly the numbers that price the business (see the
  2026-09-04 entry in `CHANGELOG.md`). Cheapest useful version: Stripe
  Billing, a `subscriptions` table, and MRR/churn in the admin console.
- **Consent is stored as a bare boolean, which isn't evidence.**
  `contacts.smsOptIn` and `emailOptIn` are `boolean` with no timestamp, no
  IP, no user agent, no record of the disclosure text that was on screen,
  and no revocation trail. TCPA statutory damages run $500–$1,500 *per
  message*, so this scales badly with the contact list and it's the first
  thing an acquirer's counsel looks for. Add those columns before real SMS
  volume, alongside the 10DLC item above and working STOP/HELP handling.
  Note on STOP: the welcome SMS carries "reply STOP to opt out" and Twilio
  honours the standard keywords at its own layer, so a customer who replies
  really is unsubscribed at the carrier. But the app never hears about it —
  there's no Twilio webhook (`app/` has only two route handlers, neither for
  inbound SMS), so `contacts.smsOptIn` stays `true` forever and the database
  quietly disagrees with the truth. That divergence is the compliance
  artifact that matters, and it's what a diligence request would ask to see.
- **Change the default admin password and staff PINs** before handing this
  to anyone — `test-admin-pass` and `1234` are exactly what they sound like.
  Partly done: production's `ADMIN_PASSWORD` (Render) was set to a real
  value at deploy time on 2026-09-21, separate from the `test-admin-pass`
  placeholder that local dev and `db/seed.ts`'s demo business still carry.
  Staff PINs are still `1234` by default on every new business
  (`businesses.staffPin`) — worth setting a real one per business as it's
  created, not just fixing the platform-level password once.
- **Physical tag provisioning, tried for real.** The write-on-demand plan
  (blank NTAG213 stickers + a phone NFC-writer app at point of sale) was the
  agreed approach from the start but hasn't actually been exercised with a
  physical tag yet — worth doing once before the first real sale, not
  discovering a snag mid-pitch.
- **A real NTAG 424 DNA punch tag, provisioned and tapped.** The SUN
  verification is tested against NXP's published vectors and against a
  software chip that generates genuine tap URLs, so the server half is
  known-good — but no physical DNA tag has been written yet. Needs tags
  ordered (~$1.50–3 each, one per business) and a way to write the keys: a
  USB reader like an ACR122U, or buying them pre-programmed. This is the one
  step that can't be done with the free phone NFC-writer apps the NTAG213
  hub tags use.
- **Decide the default punch-tag placement per business.** Counter (anyone
  who walks in earns a stamp) vs. behind the counter (staff decide). It's a
  deployment choice with no code behind it, but it's worth having a default
  answer at the door rather than improvising per pitch.

## Product decisions that need you, not more code

- **GoHighLevel integration depth.** Discussed at length on 2026-08-24, not
  decided: stay fully custom, do a shallow swap (point `lib/sms.ts` /
  `lib/email.ts` at GHL's API instead of Twilio/Resend, architecture
  otherwise unchanged), or go deep (GHL owns contacts/opt-in state, its
  Workflow builder handles delayed messaging). The tap/reward/punch-card
  logic stays custom under any of the three — this is purely about who owns
  messaging and contact state.
- **Scheduled/delayed review-request messaging.** Right now the welcome
  text sends immediately on identify and nothing follows up later. If this
  stays custom, it needs a scheduled job (Vercel Cron → a route handler);
  if GHL goes deep, its Workflow delay steps solve this for free. Worth
  deciding alongside the GHL question rather than separately.
- **What to charge businesses.** Two cost figures exist and they disagree,
  so be deliberate about which one you price against:
  - **$4.30/business/month at 100-business scale** — the 2026-08-24 research,
    done at concept stage, before any code existed. It assumed heavier
    messaging volume and a wider tool stack (Airtable/Softr/Zapier).
  - **$1.07/business/month at 100 scale** ($2.74 at 5, $1.12 at 25) — a
    bottom-up analysis on 2026-08-25 grounded in the shipped code paths, on
    Render rather than Vercel. It came in lower mainly because SMS/email
    fire *once per contact ever* (first identify at a business), not per
    visit or per redemption.

  The second is the better number, but **neither has been checked against a
  real Twilio/Resend invoice**, because nothing has been sent live yet. Treat
  $1.07 as the working floor and re-derive it from real bills once the first
  businesses are running.

  A pricing recommendation was worked up on 2026-09-04 against this floor and
  against competitor pricing: a **$79 / $149 / $249 ladder with $149 as the
  lead tier**, plus a $199 one-time setup fee. The reasoning is that Square
  Loyalty ($45/mo) is points-only and locked to Square's POS, while Birdeye
  ($299+) and Podium ($399+) do reviews without a loyalty mechanic — so a
  business wanting both pays ~$344/mo today. Not yet charged to anyone; there
  is no billing system (below).
- **Self-serve ecommerce, as a second (or replacement) sales channel** —
  sell plates online, businesses activate them themselves instead of you
  configuring every account by hand. The claimable-tag mechanism already
  supports this, and owner login now exists (below); what's still missing is
  self-serve *signup* — creating your own business record and claiming your
  own tags without you. See `ECOMMERCE-PLAN.md` for the full breakdown.
- **How much a business owner should be able to change themselves.** The
  passwordless owner login now ships with a deliberately read-only surface
  (stats only). Letting owners edit their own review links and reward config
  would cut your support load and is what self-serve ecommerce eventually
  needs — the tradeoff is that nobody vets what they paste in, and a bad URL
  silently breaks their live tags. Showing them their own customer list is a
  separate call, weighing "you own your customers" as a pitch against how
  much the list is the thing keeping them.

## Designed, not yet built

Worked out through a full architecture discussion on 2026-09-01 (see
`CHANGELOG.md`); the dashboard half of that discussion shipped, and the
tracked-redirect route and claimable generic tags below have since shipped
too — these haven't:

- **A shorter, readable tag URL.** Tags currently carry
  `app.meetcompass.io/t/<uuid>` — 36 characters of hex that nobody can read
  off a sticker, say out loud, or sanity-check at a glance. It was chosen
  deliberately for the viability test because it needs no business record to
  exist before the tag is written, so a stack of blanks can be batch-written
  and claimed on a doorstep. Once reviews-only is proven, two shapes are
  worth revisiting:
  - `app.meetcompass.io/r/<business-slug>` — readable, one per business, the
    owner sees their own name in it. `/r/` is currently
    `/r/[businessId]/[activity]`, and two different dynamic segment names
    can't share a position, so this wants
    `app/r/[business]/[[...activity]]/route.ts`: an optional catch-all where
    the segment accepts a uuid *or* a slug and a missing activity defaults to
    `google_review`. That keeps every existing `/r/<uuid>/<activity>` hub
    link working untouched.
  - `app.meetcompass.io/<business-slug>` — shortest possible, but a root
    catch-all needs a reserved-word list (`admin`, `t`, `r`, `p`, `card`,
    `owner`, `staff`) or a business slug can shadow the app, and it spends
    the whole root namespace. **Weaker option than when this was written:**
    production moved off the apex entirely on 2026-09-21 —
    `meetcompass.io` turned out to already host a separate, live
    GoHighLevel-built site, found while wiring up real DNS. This shape would
    need the apex freed up first, not just a route added; see the "Why
    `app.meetcompass.io`" note in `README.md`.

  **The constraint on any of this: it is additive, never a migration.** A tag
  stores the whole URL and cannot be rewritten remotely, so `/t/<uuid>` has
  to keep resolving for as long as any tag carrying it is stuck to a counter
  somewhere. A new shape applies to newly written tags only; the old route
  stays forever. Same reasoning as the hostname note in `README.md`.

- **Apple / Google Wallet punch-card passes.** Explicitly shelved on
  2026-09-03 until the current card proves itself in the field — a wallet
  pass is what customers actually expect from a punch card, but it's a
  different weight class from a web page: a paid Apple developer account,
  pass-signing certificates, a `.pkpass` builder, and an APNs push on every
  stamp change, plus the Google Wallet equivalent (Cloud project, issuer
  account, JWT signing). Revisit once a real business has run the web card
  long enough to say whether customers come back to it at all — the answer
  to that is now measurable, since `/card/[slug]` is a distinct URL.
- **Owner-editable settings** — a page for the owner to edit their own
  contact info and review/social links, and/or see their customer list. The
  read-only stats half of this shipped on 2026-09-02 alongside the
  passwordless owner login, which also settled the open credential question
  this item used to carry: it's a separate owner login, *not* the staff PIN,
  so a cashier can't reach revenue-adjacent stats. What's left is the write
  half — see the product decision above.
- **Three AI features**, all meant to sit on one shared, tool-callable
  metrics layer (the model calls typed functions like
  `getReviewTaps(businessId, range, platform?)` — it never runs a raw query,
  and a business's own dashboard can't be talked into querying another
  business's data):
  - An auto-generated insights panel above the dashboard's charts, cached
    (e.g. daily) rather than recomputed per page view.
  - A natural-language query box ("How many reviews and punches did I get in
    December? Was that more than November and January?") that parses into
    calls against the metrics layer and renders the result with the
    dashboard's own chart/tile components — not raw model-generated HTML.
  - AI-drafted commentary in the monthly emailed report (below), on top of
    the raw numbers rather than replacing them.
- **Scheduled link-health agents** (raised 2026-09-02). A cron job that walks
  every business and checks each review/social link it has on file, asking two
  questions per link: *does it still work*, and *does it point at this
  business* — the destination's name and address matched against the business
  row (which is what the address collected on 2026-09-02 makes possible; a
  Google place ID pasted from the wrong search result is invisible today). On
  a failure, the agent finds the correct write-a-review URL for that business
  and puts it back on the business's page.
  - **Why it's worth automating:** a dead or wrong review link fails silently.
    Every tap on that business's hub goes nowhere until a customer complains
    to the business and the business complains to you — and the tracked
    redirect at `/r/[businessId]/[activity]` can't catch it, because it
    records the click and forwards; it never fetches the destination.
  - **Decide before building: apply, or propose?** Letting an agent write a
    live link is the same write-risk already flagged under "Owner-editable
    settings" — worse, actually, since a wrong pick could point a business's
    customers at a *competitor's* review page and nobody would notice for
    weeks. Suggested shape: the agent proposes, and the fix lands in **Needs
    attention** with the old URL, the new one, and the evidence it matched on
    (name + address), one click to apply. Reserve auto-apply, if ever, for an
    exact address match.
  - **Cost shape:** the health check itself is a fetch plus a comparison —
    cheap enough to run weekly per business. *Finding* a replacement link
    costs a search/maps lookup, so it should only run on a failure, not on
    every pass.
  - Shares the missing piece below: there's no cron infrastructure yet, and
    this and the monthly report should land on the same one.
- **Monthly emailed business metrics.** No cron infrastructure exists yet.
  Cheapest path if deploying to Vercel: Vercel Cron hitting a route handler
  on the 1st of each month, iterating businesses, sending via the existing
  `sendEmail`/Resend helper. Needs a hosting-target decision first if not
  deploying to Vercel.

## Known gaps, not blocking

- **Landing page visual design.** A logo mark, favicon and blue palette
  landed on 2026-08-30, but only on the landing page, admin login and admin
  layout. The customer hub (`/t/[tagId]`) and the staff console still use the
  old inline wordmark — the two screens customers and staff actually look at.
- **Nothing distinguishes a real tap from a preview fetch.** `/t/[tagId]`
  increments `tapCount` and writes a `review_click` event on any GET, so a
  link scanner, a messaging app's unfurl, or your own testing all count as
  customer taps. Harmless while the URL only ever lives on a sticker, and it
  was checked as part of the reviews-only build that a tap is *not* cached
  (the response carries `no-cache, must-revalidate`, so repeat taps really do
  reach the server and really are counted). It matters more than it looks
  during a viability test, because tap count is the number being used to
  decide whether any of this works — worth a bot/user-agent filter, or
  counting distinct sessions, before those numbers get shown to a business.

- **Punch tags aren't deletable or re-keyable in admin.** Same gap as tags
  below, but it matters more here: a lost or compromised tag currently has no
  way to be revoked short of editing the database.
- **No way to delete or reorder tags** in admin — you can add more (for
  extra physical placements) but not remove ones you no longer need or
  change their display order.
- **Contacts page has no pagination or search.** Fine at demo/pilot scale;
  will need it once a business has more than a screenful of contacts.
- **Claiming a tag has no audit trail.** Re-claiming overwrites `businessId`/
  `claimedAt`/`directActivity` with no history kept — which business had a
  given tag before is unrecoverable once it's reassigned. Fine under the
  current single-operator threat model; revisit if that changes.
- **A reassigned tag's tap count isn't reset.** `tapCount`/`lastTappedAt` are
  a lifetime counter on the physical sticker, not per-business, so a tag
  moved from a churned business to a new one keeps counting from before.
  Doesn't affect any business's real metrics (`events.businessId` is set at
  insert time and untouched by reassignment) — only the cosmetic "N taps"
  line on the tag's own card.

## Ideas not yet discussed with you

Everything above came directly out of the conversation so far. These
haven't been raised or prioritized — listed only so they're not lost, not
as a commitment:

- CSV export of a business's contacts.
- Actually exercising the per-business `smsFromNumber` override the schema
  already supports (right now every business would share one platform
  number).
