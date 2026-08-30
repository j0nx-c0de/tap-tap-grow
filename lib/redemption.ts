import type { redemptions } from "@/db/schema";

// How long after redeeming the customer's screen keeps showing the animated
// live-proof view.
//
// This window is deliberately generous, because it is NOT the security
// control — the *motion* is. A screenshot is dead on arrival however long the
// window is: it can't animate and its clock reads the wrong time. All the
// window bounds is how long a legitimate customer has to flag down a staff
// member who's mid-rush, so erring short only ever punishes honest people.
export const PROOF_WINDOW_MS = 10 * 60 * 1000;

// How long a spent reward stays on the customer's hub at all. Past this it
// drops off and they just see their punch card again.
export const PROOF_VISIBLE_MS = 24 * 60 * 60 * 1000;

export type RewardStatus = "pending" | "approved" | "redeemed";

export type RewardView = {
  redemptionId: string;
  code: string;
  status: RewardStatus;
  // ISO string rather than a Date: this crosses the server/client boundary
  // into a Client Component, and the client re-parses it inside an effect.
  redeemedAtIso: string | null;
  headline: string;
  description: string | null;
};

export function toRewardView(
  row: typeof redemptions.$inferSelect,
  headline: string,
  description: string | null,
): RewardView {
  return {
    redemptionId: row.id,
    code: row.code,
    status: row.status,
    redeemedAtIso: row.redeemedAt ? row.redeemedAt.toISOString() : null,
    headline,
    description,
  };
}

// Whether a reward row should still be surfaced on the hub at all.
//
// A `flat` business issues exactly one reward per person ever, so it stays
// visible forever — otherwise the hub would offer the claim button again to
// someone who already spent theirs. A punch-card reward disappears a day
// after being spent so the customer goes back to seeing their card.
export function isRewardVisible(
  row: typeof redemptions.$inferSelect,
  rewardMode: "none" | "flat" | "punch_card",
  now: number,
): boolean {
  if (rewardMode === "flat") return true;
  if (row.status !== "redeemed") return true;
  if (!row.redeemedAt) return true;
  return now - row.redeemedAt.getTime() < PROOF_VISIBLE_MS;
}
