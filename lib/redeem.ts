import { and, desc, eq } from "drizzle-orm";
import type { getDb } from "@/db";
import { businesses, events, redemptions } from "@/db/schema";
import { toRewardView, type RewardView } from "@/lib/redemption";

export type SpendResult =
  | { status: "error"; message: string }
  | { status: "ok"; reward: RewardView };

// Spend a customer's outstanding reward. Kept out of both the actions module
// and lib/redemption.ts on purpose: the former would make it a bare endpoint
// and tie it to a request scope, and the latter is imported by a Client
// Component, so it has to stay free of database imports.
export async function spendReward(
  db: ReturnType<typeof getDb>,
  business: typeof businesses.$inferSelect,
  contactId: string,
): Promise<SpendResult> {
  const [row] = await db
    .select()
    .from(redemptions)
    .where(
      and(
        eq(redemptions.businessId, business.id),
        eq(redemptions.contactId, contactId),
        eq(redemptions.kind, "reward"),
      ),
    )
    .orderBy(desc(redemptions.createdAt))
    .limit(1);

  if (!row) return { status: "error", message: "You don't have a reward to redeem yet." };
  if (row.status === "pending") {
    return { status: "error", message: "Staff need to confirm this one before you can redeem it." };
  }

  if (row.status === "approved") {
    // Guarded update rather than read-then-write: two quick taps must not both
    // believe they were the one that spent it.
    const spent = await db
      .update(redemptions)
      .set({ status: "redeemed", redeemedAt: new Date() })
      .where(and(eq(redemptions.id, row.id), eq(redemptions.status, "approved")))
      .returning();

    if (spent.length > 0) {
      await db.insert(events).values({
        businessId: business.id,
        contactId,
        tagId: row.tagId,
        type: "redemption_redeemed",
      });
      return {
        status: "ok",
        reward: toRewardView(spent[0], business.rewardHeadline, business.rewardDescription),
      };
    }
  }

  // Already spent — by an earlier tap, or by the request that lost the race
  // above. Either way the honest answer is the same one.
  const [current] = await db.select().from(redemptions).where(eq(redemptions.id, row.id)).limit(1);
  return {
    status: "ok",
    reward: toRewardView(current, business.rewardHeadline, business.rewardDescription),
  };
}
