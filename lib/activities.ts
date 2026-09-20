import { events } from "@/db/schema";
import type { getDb } from "@/db";
import type { PublicBusiness } from "./business";

export type ActivityId =
  | "google_review"
  | "yelp_review"
  | "facebook_review"
  | "follow_instagram"
  | "follow_tiktok";

// The one activity the reviews-only quick add wires up, named rather than
// spelled as a literal at each call site so a rename stays a type error.
export const GOOGLE_REVIEW = "google_review" satisfies ActivityId;

// A repeatable, cooldown-gated stamp for coming back — distinct from the
// one-time activities below, which can each only ever be claimed once.
export const VISIT_ACTIVITY = "visit" as const;

// Reviews and follows are separated here because the difference is a
// compliance boundary, not a presentational one. See `isStampableActivity`.
export type ActivityKind = "review" | "follow";

type ActivityDef = {
  id: ActivityId;
  label: string;
  urlField: "googleReviewUrl" | "yelpReviewUrl" | "facebookReviewUrl" | "instagramUrl" | "tiktokUrl";
  kind: ActivityKind;
  // Whether the link may be phrased as a request at all. Yelp's content
  // guidelines forbid *asking* for reviews outright — independent of any
  // reward — and enforce it with a ranking penalty and a public Consumer
  // Alert on the business's page. So Yelp is offered as a plain pointer,
  // never under a "please review us" heading and never with a verb.
  solicitable: boolean;
};

const ACTIVITY_CATALOG: ActivityDef[] = [
  { id: "google_review", label: "Review us on Google", urlField: "googleReviewUrl", kind: "review", solicitable: true },
  { id: "yelp_review", label: "Find us on Yelp", urlField: "yelpReviewUrl", kind: "review", solicitable: false },
  { id: "facebook_review", label: "Review us on Facebook", urlField: "facebookReviewUrl", kind: "review", solicitable: true },
  { id: "follow_instagram", label: "Follow us on Instagram", urlField: "instagramUrl", kind: "follow", solicitable: true },
  { id: "follow_tiktok", label: "Follow us on TikTok", urlField: "tiktokUrl", kind: "follow", solicitable: true },
];

// Whether completing an activity may earn a punch.
//
// A review never can. Google's review policy bans offering "discounts, gifts,
// or monetary rewards" for a review and names loyalty points specifically,
// and the ban applies "regardless of whether the review is positive or
// negative" — so a sentiment-neutral stamp is still a violation, and the
// penalty lands on the *business*: removed reviews, a suspended profile, or
// Yelp's Compensated Activity Alert on their page. Following an account
// carries no such restriction; rewarding one is ordinary marketing.
//
// Derived from `kind` rather than stored per-activity on purpose, so a new
// review platform added to the catalog can't quietly become stampable.
export function isStampableActivity(id: string): boolean {
  if (id === VISIT_ACTIVITY) return true;
  const def = ACTIVITY_CATALOG.find((a) => a.id === id);
  return def !== undefined && def.kind !== "review";
}

export type AvailableActivity = {
  id: ActivityId;
  label: string;
  url: string;
  kind: ActivityKind;
  solicitable: boolean;
};

// Only offer activities the business has actually configured a link for.
export function availableActivities(business: PublicBusiness): AvailableActivity[] {
  return ACTIVITY_CATALOG.filter((a) => business[a.urlField]).map((a) => ({
    id: a.id,
    label: a.label,
    url: business[a.urlField] as string,
    kind: a.kind,
    solicitable: a.solicitable,
  }));
}

// The activities a customer can actually claim a stamp for — follows only.
// This is what the claim path validates against, so the boundary holds even
// if a page were ever to render a claim button it shouldn't.
export function stampableActivities(business: PublicBusiness): AvailableActivity[] {
  return availableActivities(business).filter((a) => isStampableActivity(a.id));
}

// Review links, which are shown and tracked but never earn anything.
export function reviewActivities(business: PublicBusiness): AvailableActivity[] {
  return availableActivities(business).filter((a) => a.kind === "review");
}

// Where an activity link on the hub actually points — a same-origin hop
// through `/r/[businessId]/[activity]` that logs the click server-side
// before redirecting, rather than linking straight to the destination.
export function activityRedirectPath(
  businessId: string,
  tagId: string | null,
  activityId: string,
): string {
  const path = `/r/${businessId}/${activityId}`;
  return tagId ? `${path}?tag=${tagId}` : path;
}

// Validates that `activityId` is one the business has actually configured a
// URL for, and if so logs the click server-side before returning it. Shared
// by every entry point that can end in a review/social redirect — a route
// handler and a direct-activity tag tap alike — since both need to do this
// same lookup immediately before logging; only the actual redirect (which
// differs — NextResponse.redirect vs. next/navigation's redirect()) stays
// with each caller.
export async function logReviewClick(
  db: ReturnType<typeof getDb>,
  business: PublicBusiness,
  args: { tagId: string | null; activityId: string },
): Promise<AvailableActivity | null> {
  const match = availableActivities(business).find((a) => a.id === args.activityId);
  if (!match) return null;
  await db
    .insert(events)
    .values({ businessId: business.id, tagId: args.tagId, type: "review_click", platform: match.id });
  return match;
}

export function activityLabel(activity: string | null): string {
  if (!activity) return "";
  if (activity === VISIT_ACTIVITY) return "Visit";
  return ACTIVITY_CATALOG.find((a) => a.id === activity)?.label ?? activity;
}
