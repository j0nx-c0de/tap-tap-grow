import { pgTable, uuid, text, integer, boolean, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";

// Postgres can't drop enum values once they're in use, so the old
// signup/review/punch values stay valid even though every tag now renders
// the same unified hub page regardless of its type — new tags just default
// to "hub" and the field is kept around as a label, not branched on.
export const tagType = pgEnum("tag_type", ["signup", "review", "punch", "hub"]);
export const redemptionKind = pgEnum("redemption_kind", ["reward", "stamp"]);
export const redemptionStatus = pgEnum("redemption_status", ["pending", "approved"]);
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
