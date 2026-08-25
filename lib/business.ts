import type { businesses } from "@/db/schema";

export type PublicBusiness = {
  id: string;
  name: string;
  redemptionMode: "honor" | "staff_verified";
  rewardMode: "none" | "flat" | "punch_card";
  rewardHeadline: string;
  rewardDescription: string | null;
  punchGoal: number;
  punchCooldownMinutes: number;
  googleReviewUrl: string | null;
  yelpReviewUrl: string | null;
  facebookReviewUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
};

// Server Component props passed into a Client Component are serialized into
// the page's payload, so the full business row (which includes staffPin)
// must never reach the customer-facing /t/[tagId] client components.
export function toPublicBusiness(b: typeof businesses.$inferSelect): PublicBusiness {
  return {
    id: b.id,
    name: b.name,
    redemptionMode: b.redemptionMode,
    rewardMode: b.rewardMode,
    rewardHeadline: b.rewardHeadline,
    rewardDescription: b.rewardDescription,
    punchGoal: b.punchGoal,
    punchCooldownMinutes: b.punchCooldownMinutes,
    googleReviewUrl: b.googleReviewUrl,
    yelpReviewUrl: b.yelpReviewUrl,
    facebookReviewUrl: b.facebookReviewUrl,
    instagramUrl: b.instagramUrl,
    tiktokUrl: b.tiktokUrl,
  };
}
