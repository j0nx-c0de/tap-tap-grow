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
- **`flat` and `none` reward modes, live-tested.** `punch_card` has been
  driven end-to-end against real data, including the goal-reached →
  reward-issued → reset path. The other two modes share the same
  identify/claim infrastructure but haven't individually been clicked
  through against live data.
- **Change the default admin password and staff PINs** before handing this
  to anyone — `test-admin-pass` and `1234` are exactly what they sound like.
- **Physical tag provisioning, tried for real.** The write-on-demand plan
  (blank NTAG213 stickers + a phone NFC-writer app at point of sale) was the
  agreed approach from the start but hasn't actually been exercised with a
  physical tag yet — worth doing once before the first real sale, not
  discovering a snag mid-pitch.

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
- **What to charge businesses.** The 2026-08-24 cost research puts the
  infra floor at roughly $4.30/business/month at 100-business scale (custom
  build) — a number to price against, not a number that's been turned into
  an actual price yet.
- **Business self-service login.** `/admin` is deliberately single-operator
  right now, since the door-to-door model has you configuring every
  business yourself. Worth revisiting only if/when businesses start asking
  to manage their own reward config or see their own contacts without going
  through you.

## Known gaps, not blocking

- **Landing page visual design.** The hub page is clean but generic —
  flagged from the very first build as worth a real design pass once the
  flow is validated with real businesses, still true.
- **No way to delete or reorder tags** in admin — you can add more (for
  extra physical placements) but not remove ones you no longer need or
  change their display order.
- **Contacts page has no pagination or search.** Fine at demo/pilot scale;
  will need it once a business has more than a screenful of contacts.

## Ideas not yet discussed with you

Everything above came directly out of the conversation so far. These
haven't been raised or prioritized — listed only so they're not lost, not
as a commitment:

- CSV export of a business's contacts.
- Actually exercising the per-business `smsFromNumber` override the schema
  already supports (right now every business would share one platform
  number).
- Reporting beyond the raw counts already on the business detail page —
  redemption rate over time, which activities actually convert, etc.
