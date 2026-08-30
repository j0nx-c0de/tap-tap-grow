"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { businesses, events, redemptions } from "@/db/schema";
import { isStaffAuthed, setStaffSession } from "@/lib/auth";
import { awardStampAndMaybeIssueReward } from "@/lib/punch-card";

export type PinState = { status: "idle" | "error"; message?: string };

export async function verifyStaffPin(
  businessSlug: string,
  _prev: PinState,
  formData: FormData,
): Promise<PinState> {
  const pin = String(formData.get("pin") ?? "").trim();
  const db = getDb();
  const [business] = await db.select().from(businesses).where(eq(businesses.slug, businessSlug)).limit(1);

  if (!business || business.staffPin !== pin) {
    return { status: "error", message: "Wrong PIN — try again." };
  }

  await setStaffSession(businessSlug);
  revalidatePath(`/staff/${businessSlug}`);
  return { status: "idle" };
}

export async function approveRedemption(formData: FormData): Promise<void> {
  const businessSlug = String(formData.get("businessSlug") ?? "");
  const redemptionId = String(formData.get("redemptionId") ?? "");

  if (!businessSlug || !redemptionId) return;
  if (!(await isStaffAuthed(businessSlug))) {
    throw new Error("Not authorized");
  }

  const db = getDb();
  const [r] = await db.select().from(redemptions).where(eq(redemptions.id, redemptionId)).limit(1);
  // Only a pending row is approvable. Guarding on "not pending" rather than
  // "not already approved" also stops an approve click from resurrecting a
  // reward that has since been redeemed.
  if (!r || r.status !== "pending") return;

  await db
    .update(redemptions)
    .set({ status: "approved", approvedAt: new Date() })
    .where(eq(redemptions.id, redemptionId));

  await db.insert(events).values({
    businessId: r.businessId,
    contactId: r.contactId,
    tagId: r.tagId,
    type: "redemption_approved",
  });

  if (r.kind === "stamp" && r.contactId) {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, r.businessId)).limit(1);
    if (business) {
      // Approving a stamp can itself fill the card — same "did this reach
      // the goal" check the honor-mode instant-approve path uses, so a
      // staff-verified business's reward still gets issued and the card
      // still resets, not just a plain increment.
      await awardStampAndMaybeIssueReward(db, {
        businessId: r.businessId,
        contactId: r.contactId,
        tagId: r.tagId,
        punchGoal: business.punchGoal,
        rewardHeadline: business.rewardHeadline,
        redemptionMode: business.redemptionMode,
      });
    }
  }

  revalidatePath(`/staff/${businessSlug}`);
}
