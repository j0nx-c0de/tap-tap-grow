import type { PublicBusiness } from "./business";

export type ActivityId =
  | "google_review"
  | "yelp_review"
  | "facebook_review"
  | "follow_instagram"
  | "follow_tiktok";

// A repeatable, cooldown-gated stamp for coming back — distinct from the
// one-time activities below, which can each only ever be claimed once.
export const VISIT_ACTIVITY = "visit" as const;

type ActivityDef = {
  id: ActivityId;
  label: string;
  urlField: "googleReviewUrl" | "yelpReviewUrl" | "facebookReviewUrl" | "instagramUrl" | "tiktokUrl";
};

const ACTIVITY_CATALOG: ActivityDef[] = [
  { id: "google_review", label: "Review us on Google", urlField: "googleReviewUrl" },
  { id: "yelp_review", label: "Review us on Yelp", urlField: "yelpReviewUrl" },
  { id: "facebook_review", label: "Review us on Facebook", urlField: "facebookReviewUrl" },
  { id: "follow_instagram", label: "Follow us on Instagram", urlField: "instagramUrl" },
  { id: "follow_tiktok", label: "Follow us on TikTok", urlField: "tiktokUrl" },
];

export type AvailableActivity = { id: ActivityId; label: string; url: string };

// Only offer activities the business has actually configured a link for.
export function availableActivities(business: PublicBusiness): AvailableActivity[] {
  return ACTIVITY_CATALOG.filter((a) => business[a.urlField]).map((a) => ({
    id: a.id,
    label: a.label,
    url: business[a.urlField] as string,
  }));
}

export function activityLabel(activity: string | null): string {
  if (!activity) return "";
  if (activity === VISIT_ACTIVITY) return "Visit";
  return ACTIVITY_CATALOG.find((a) => a.id === activity)?.label ?? activity;
}
