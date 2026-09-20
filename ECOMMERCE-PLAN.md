# Self-serve ecommerce: reference doc

Not built. This captures how the claimable-tag system works today, and what
a self-serve ecommerce version (sell plates online, businesses activate them
without you) would actually need — written up so there's something concrete
to build from later, rather than re-deriving it from scratch. See
`ROADMAP.md` for how this fits against everything else still open.

## How claimable tags work today

The mechanism, precisely, because it's easy to mis-picture:

- Every physical plate has its **own** QR code — a unique URL like
  `/t/<uuid>` — even when a whole batch is printed with identical artwork.
  "Universal" describes the *production process* (order/print a generic
  stack without knowing which business each one will serve), never the QR
  code itself. Two plates cannot share one QR code and route to two
  different businesses — a QR is a static pointer to one fixed URL, and a
  scan of it is indistinguishable from any other scan of the same code.
  (Gift-card analogy: every card off the rack looks identical, but each has
  a different serial number underneath.)
- Batch-generating tags (`/admin/tags`, `generateUnclaimedTags` in
  `app/admin/(protected)/actions.ts`) creates rows in `tags`
  (`db/schema.ts`) with a fresh `id` (→ the QR's URL) and a fresh, unique,
  human-typeable `activationCode` (`lib/codes.ts`'s
  `generateTagActivationCode`) — but no `businessId` yet. The URL exists
  and is fixed from this moment on; nothing about it changes later.
- **Claiming** (`claimTag` in the same file) is a database update, not a
  generation step: given an `activationCode`, look up the tag row that has
  it, and set `businessId` / `claimedAt` / optionally `directActivity` on
  that *existing* row. The QR code is never touched.
- Claiming is always allowed regardless of current state — re-entering a
  code rebinds the tag, whether that's onto the same business (to change
  `directActivity`) or a different one entirely (reassignment after churn).
  No separate "release" step. This is what lets one physical plate get
  reused across businesses over its lifetime with zero reprinting.
- `directActivity` (set at claim time) decides what a tap actually does:
  unset → the full hub (`app/t/[tagId]/page.tsx` renders `Hub`, every
  configured review/social link shown); set to one `ActivityId` → skip the
  hub, log the click, redirect straight to that one platform
  (`lib/activities.ts`'s `logReviewClick`, shared with the
  `/r/[businessId]/[activity]` route).

## Today's trust model — the thing that has to change

There is exactly one credential in the whole admin surface:
`ADMIN_PASSWORD`, checked in `app/admin/login/actions.ts`, producing one
shared signed cookie (`lib/auth.ts`, `isAdminAuthed()` — verifies against
the literal string `"admin"`, not a per-user identity). Every business on
the platform today was created, configured, and every tag claimed, by
*you*, through that one login.

**Updated 2026-09-02 — the hardest part of this is now solved.** When this
doc was written there was no concept of a business owner having their own
account, and that was named here as the actual blocker. It isn't any more.
The passwordless owner login (`lib/owner-login.ts`, `/owner/[businessSlug]`)
authenticates a specific business owner against the `ownerEmail` /
`ownerPhone` already on the business row — magic link or 6-digit SMS code,
HMAC-stored single-use tokens, rate-limited both directions, year-long
cookie keyed by business id. That is precisely "a way for someone who isn't
you to authenticate as a specific business," and it exists.

Two other credentials sit alongside it: `isStaffAuthed(businessSlug)`, a
shared per-business PIN (`businesses.staffPin`) gating the redemption
console, deliberately kept separate so a cashier can't reach owner stats;
and `ADMIN_PASSWORD` for you.

**What's actually left is narrower than this doc originally framed it:**
the owner session exists but grants a read-only stats page, and there's no
way to *create* a business without you. So the remaining gaps are a sign-up
path and a write surface — not an auth system. Nothing about the tag
mechanism was ever the blocker: `claimTag` takes a `businessId` and an
activation code and doesn't care who called it.

## What a self-serve version needs, piece by piece

1. **Business self-serve accounts** (the real work — everything else is
   comparatively small). Sign-up, login, session scoped to one business.
   Replaces "you fill in the business's review links and reward config in
   `/admin`" with the owner doing it themselves.

   **Partly solved since this doc was written.** A passwordless owner login
   shipped on 2026-09-02 (`/owner/[businessSlug]`, keyed off the `ownerEmail`
   / `ownerPhone` already on every business — see "Owner login" in
   `README.md`), so authenticating as a specific business is no longer the
   open problem this section describes. What's still missing is *sign-up*
   (creating your own business record with nobody on the other end) and any
   *write* surface at all — the owner view is deliberately read-only stats.
   `ROADMAP.md` tracks the write half under "Owner-editable settings."
2. **A public claim flow**, reachable by an authenticated business owner,
   not gated behind `ADMIN_PASSWORD`. Same `claimTag` logic underneath, new
   entry point. Needs its own hardening once it's public:
   - Rate-limit / lock out repeated failed activation-code attempts — an
     8-character code is fine to type into an admin-only form with no
     limit; it is not fine as a public endpoint anyone can hit.
   - Decide what "claim" requires — logged in as *a* business is probably
     enough (a code is a bearer credential, like a gift card), but worth
     being deliberate about it rather than assuming.
3. **Checkout and fulfillment.** Doesn't exist in any form yet. Sell "a
   pack of N plates" (Stripe Checkout + a simple order flow, or a
   Shopify front end pointing back at this app), then fulfillment prints
   from a generated `generateUnclaimedTags` batch and ships physical plates
   with their activation codes to the buyer. The generation half already
   works; the storefront and shipping half is new, unrelated infrastructure.
4. **A vetting decision.** Today you implicitly vet every business by
   typing in their real review URL yourself. Self-serve removes that check
   — a stranger enters their own links with nobody looking. Decide up front
   whether that's acceptable (probably fine — worst case is a bad link, not
   a security hole) or whether sign-up needs some verification step before
   a business goes live.

## Open product questions, not technical ones

- Does self-serve **replace** the door-to-door model, or run **alongside**
  it? They have different trust levels, different support burden, and
  probably different pricing — worth deciding whether this is a second
  product or a pivot.
- Who is the ecommerce buyer — the business owner directly, or someone like
  you reselling to businesses? Changes what the checkout flow and
  onboarding copy need to assume.
- Support model: a self-serve customer with a bricked/lost activation code
  needs a recovery path that doesn't require you personally, at some scale.

## Suggested build order, if this moves forward

1. Business self-serve accounts (auth + a settings page scoped to one
   business) — everything else depends on this existing first.
2. Public claim flow on top of it, with rate-limiting.
3. Checkout + fulfillment wiring, pointed at the already-working
   batch-generation mechanism.
4. Revisit the vetting question once real signups are happening, not before.
