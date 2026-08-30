import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { punchCards, redemptions } from "@/db/schema";
import { generateRedemptionCode } from "@/lib/codes";

type AwardResult =
  | { stampCount: number; rewardIssued: false }
  | {
      stampCount: 0;
      rewardIssued: true;
      rewardId: string;
      rewardCode: string;
      rewardApproved: boolean;
    };

// Shared by both the honor-mode instant-approve path and the staff console's
// approval action, so "did this stamp fill the card" is only ever decided
// in one place.
export async function awardStampAndMaybeIssueReward(
  db: ReturnType<typeof getDb>,
  params: {
    businessId: string;
    contactId: string;
    tagId: string | null;
    punchGoal: number;
    rewardHeadline: string;
    redemptionMode: "honor" | "staff_verified";
  },
): Promise<AwardResult> {
  const { businessId, contactId, tagId, punchGoal, rewardHeadline, redemptionMode } = params;

  const [pc] = await db
    .insert(punchCards)
    .values({ businessId, contactId, stampCount: 1 })
    .onConflictDoUpdate({
      target: [punchCards.businessId, punchCards.contactId],
      set: { stampCount: sql`${punchCards.stampCount} + 1`, updatedAt: new Date() },
    })
    .returning();

  if (pc.stampCount < punchGoal) {
    return { stampCount: pc.stampCount, rewardIssued: false };
  }

  const rewardApproved = redemptionMode === "honor";
  const code = generateRedemptionCode();

  const [reward] = await db
    .insert(redemptions)
    .values({
      businessId,
      contactId,
      tagId,
      kind: "reward",
      code,
      status: rewardApproved ? "approved" : "pending",
      rewardSnapshot: rewardHeadline,
      approvedAt: rewardApproved ? new Date() : null,
    })
    .returning();

  await db
    .update(punchCards)
    .set({ stampCount: 0, updatedAt: new Date() })
    .where(and(eq(punchCards.businessId, businessId), eq(punchCards.contactId, contactId)));

  return { stampCount: 0, rewardIssued: true, rewardId: reward.id, rewardCode: code, rewardApproved };
}
