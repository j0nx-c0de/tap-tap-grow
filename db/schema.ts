import { pgTable, uuid, text, integer, boolean, timestamp, pgEnum, unique, index } from "drizzle-orm/pg-core";

// Postgres can't drop enum values once they're in use, so the old
// signup/review/punch values stay valid even though every tag now renders
// the same unified hub page regardless of its type — new tags just default
// to "hub" and the field is kept around as a label, not branched on.
export const tagType = pgEnum("tag_type", ["signup", "review", "punch", "hub"]);
export const redemptionKind = pgEnum("redemption_kind", ["reward", "stamp"]);
// pending  — staff still need to confirm the underlying claim happened.
// approved — legitimate and unspent: the customer is owed this.
// redeemed — terminal. The reward was handed over; the code is dead and can
//            never be honoured again. Splitting this out of "approved" is
//            what stops a screenshot of an old reward being presented twice.
export const redemptionStatus = pgEnum("redemption_status", ["pending", "approved", "redeemed"]);
export const redemptionModeEnum = pgEnum("redemption_mode", ["honor", "staff_verified"]);
// 'none' — review/follow links only, nothing to claim.
// 'flat' — do any/all of them, claim one reward, once, ever.
// 'punch_card' — every activity (and every cooldown-gated repeat visit)
// earns a stamp; hitting the goal issues the reward and resets the card.
export const rewardModeEnum = pgEnum("reward_mode", ["none", "flat", "punch_card"]);
export const eventType = pgEnum("event_type", [
  "signup",
  "review_click",
  "redemption_created",
  "redemption_approved",
  "redemption_redeemed",
  "punch_tap",
]);

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),

  // Who you (the operator) actually call when something's wrong with this
  // business's account — distinct from `contacts`, which is that business's
  // own customers tapping the NFC tag. Nullable so existing rows don't need
  // a migration default; the admin form requires all three for new saves.
  ownerName: text("owner_name"),
  ownerEmail: text("owner_email"),
  ownerPhone: text("owner_phone"),

  // The street address of this specific location. Stored as separate parts
  // rather than one blob so the admin list, search, and command palette can
  // show and match on "Springfield, IL" next to the name — which is the whole
  // point of collecting it: two rows named "Joe's Pizza" are either one
  // chain's two locations or a competitor trading on a near-identical name,
  // and only the address tells them apart. Nullable for the same reason the
  // owner contact fields are; the admin form requires them for new saves.
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),

  googleReviewUrl: text("google_review_url"),
  yelpReviewUrl: text("yelp_review_url"),
  facebookReviewUrl: text("facebook_review_url"),
  instagramUrl: text("instagram_url"),
  tiktokUrl: text("tiktok_url"),

  redemptionMode: redemptionModeEnum("redemption_mode").notNull().default("staff_verified"),
  rewardMode: rewardModeEnum("reward_mode").notNull().default("punch_card"),

  rewardHeadline: text("reward_headline").notNull().default("10% off your next visit"),
  rewardDescription: text("reward_description"),

  // Only meaningful when rewardMode is 'punch_card'.
  punchGoal: integer("punch_goal").notNull().default(10),
  punchCooldownMinutes: integer("punch_cooldown_minutes").notNull().default(60),

  staffPin: text("staff_pin").notNull().default("1234"),

  smsEnabled: boolean("sms_enabled").notNull().default(true),
  smsFromNumber: text("sms_from_number"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable: a batch-printed tag can exist as unclaimed inventory (no
  // business bound yet) before being claimed at a business's sign-up.
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  type: tagType("type").notNull().default("hub"),
  label: text("label"),
  // Set (or reset) each time the tag is claimed or re-claimed to a
  // business — null means unclaimed inventory.
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  // The human-typed credential that binds this physical tag to a business,
  // or later rebinds the same physical sticker to a different one. Every
  // tag gets one at creation, not just batch inventory, so any tag stays
  // reassignable later without touching the hardware.
  activationCode: text("activation_code").unique(),
  // When set, a tap skips the hub and redirects straight to this activity's
  // URL instead — plain text validated against ActivityId in application
  // code, the same precedent as redemptions.activity below, not a DB enum.
  directActivity: text("direct_activity"),
  tapCount: integer("tap_count").notNull().default(0),
  lastTappedAt: timestamp("last_tapped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name"),
    phone: text("phone").notNull(),
    email: text("email"),
    smsOptIn: boolean("sms_opt_in").notNull().default(false),
    emailOptIn: boolean("email_opt_in").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("contacts_business_phone_unique").on(table.businessId, table.phone)],
);

export const punchCards = pgTable(
  "punch_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    stampCount: integer("stamp_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("punch_cards_business_contact_unique").on(table.businessId, table.contactId)],
);

export const redemptions = pgTable("redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  tagId: uuid("tag_id").references(() => tags.id, { onDelete: "set null" }),
  kind: redemptionKind("kind").notNull().default("reward"),
  // Which specific thing earned this stamp: 'visit' (repeatable, cooldown-
  // gated) or a one-time activity id like 'google_review' / 'follow_tiktok'.
  // Null for kind='reward' rows.
  activity: text("activity"),
  code: text("code").notNull().unique(),
  status: redemptionStatus("status").notNull().default("pending"),
  rewardSnapshot: text("reward_snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
});

// An NTAG 424 DNA tag the business physically holds — the digital equivalent
// of a hole punch. Unlike `tags` (dumb NTAG213 stickers whose URL is static
// and therefore replayable from browser history), every tap of one of these
// emits a fresh URL carrying an encrypted UID + read counter and a CMAC that
// only the chip could have produced. Possessing the tag is the authority;
// where the business sticks it decides the policy (counter = anyone who walks
// in, behind the counter = staff decide).
export const punchTags = pgTable("punch_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  // The static part of the URL written to the chip: /p/<key>?picc_data=..&cmac=..
  key: text("key").notNull().unique(),
  label: text("label"),
  // Hex-encoded AES-128 SUN keys, matching what was provisioned onto the chip.
  // metaKey decrypts picc_data (UID + read counter); fileKey derives the
  // session key the CMAC is checked against.
  sdmMetaKey: text("sdm_meta_key").notNull(),
  sdmFileKey: text("sdm_file_key").notNull(),
  // Learned from the first valid tap and pinned after, so a second chip
  // provisioned with the same keys still cannot stamp for this business.
  uid: text("uid"),
  // The chip counter only ever increments. A tap at or below this is a replay.
  lastCounter: integer("last_counter").notNull().default(0),
  // The counter a stamp was last actually awarded for. Distinct from
  // lastCounter because a tap is verified before we know who is holding the
  // phone — a first-time customer has to identify themselves first. Gating the
  // award on this makes that second step single-use without needing to park
  // the pending tap in its own table.
  lastAwardedCounter: integer("last_awarded_counter").notNull().default(0),
  tapCount: integer("tap_count").notNull().default(0),
  lastTappedAt: timestamp("last_tapped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One-time credentials for the passwordless business-owner login. A row is
// issued per sign-in request and dies on first use, on expiry, or on too
// many wrong guesses — whichever comes first.
export const ownerLoginTokens = pgTable(
  "owner_login_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    // 'email' (a long token in a magic link) or 'sms' (a 6-digit code typed
    // in). Plain text validated in application code rather than a pgEnum,
    // the same call redemptions.activity makes — and one fewer enum to be
    // stuck with, per the note at the top of this file.
    channel: text("channel").notNull(),
    // HMAC of the secret, never the secret itself: a database leak shouldn't
    // hand over live logins.
    secretHash: text("secret_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    // Brute-force guard, for the 6-digit SMS code specifically — a long
    // emailed token isn't guessable, but a million-space code is.
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Serves the send throttle, which counts a business's recent requests.
  (table) => [index("owner_login_tokens_business_created_idx").on(table.businessId, table.createdAt)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    tagId: uuid("tag_id").references(() => tags.id, { onDelete: "set null" }),
    type: eventType("type").notNull(),
    platform: text("platform"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every dashboard metric filters by type + a createdAt range, either
    // across all businesses (admin rollup) or scoped to one — the two
    // indexes match those two access patterns rather than one compromise
    // index neither query would fully use.
    index("events_type_created_at_idx").on(table.type, table.createdAt),
    index("events_business_type_created_at_idx").on(table.businessId, table.type, table.createdAt),
  ],
);
