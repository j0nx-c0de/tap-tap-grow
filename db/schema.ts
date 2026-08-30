import { pgTable, uuid, text, integer, boolean, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";

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
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  type: tagType("type").notNull().default("hub"),
  label: text("label"),
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

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  tagId: uuid("tag_id").references(() => tags.id, { onDelete: "set null" }),
  type: eventType("type").notNull(),
  platform: text("platform"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
