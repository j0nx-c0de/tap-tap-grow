"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { businesses, contacts, events, redemptions } from "@/db/schema";
import { availableActivities, VISIT_ACTIVITY } from "@/lib/activities";
import { getContactSession, setContactSession } from "@/lib/auth";
import { toPublicBusiness } from "@/lib/business";
import { generateRedemptionCode } from "@/lib/codes";
import { sendEmail } from "@/lib/email";
import { isPlausiblePhone, normalizePhone } from "@/lib/phone";
import { awardStampAndMaybeIssueReward } from "@/lib/punch-card";
import { loadHubData, type ContactHubData } from "@/lib/hub-data";
import { awardPunchTap, type PunchAward } from "@/lib/punch-tag";
import { spendReward } from "@/lib/redeem";
import { toRewardView, type RewardView } from "@/lib/redemption";
import { sendSms } from "@/lib/sms";

// --- Identify (opt-in capture, runs once per visit before anything else) --

const identifySchema = z.object({
  phone: z.string().trim().min(7, "Enter a valid phone number").max(20),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).optional(),
  smsOptIn: z.literal("on").optional(),
  emailOptIn: z.literal("on").optional(),
});

export type { ContactHubData };

// A verified tap of the business's own DNA punch tag, carried through the
// identify step for a customer the tag has never seen before.
export type PunchTapContext = { key: string; counter: number };

export type IdentifyState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ContactHubData; punchAward: PunchAward | null };

export async function identifyContact(
  businessId: string,
  punchTap: PunchTapContext | null,
  formData: FormData,
): Promise<IdentifyState> {
  const parsed = identifySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check your details and try again.",
    };
  }
  const phone = normalizePhone(parsed.data.phone);
  if (!isPlausiblePhone(phone)) {
    return { status: "error", message: "That phone number doesn't look right." };
  }

  const db = getDb();
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) return { status: "error", message: "Something went wrong — refresh and try again." };

  const [existing] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.businessId, businessId), eq(contacts.phone, phone)))
    .limit(1);

  const { name, email, smsOptIn, emailOptIn } = parsed.data;
  let contact: typeof contacts.$inferSelect;

  if (existing) {
    [contact] = await db
      .update(contacts)
      .set({
        name: name || existing.name,
        email: email || existing.email,
        smsOptIn: smsOptIn === "on" ? true : existing.smsOptIn,
        emailOptIn: emailOptIn === "on" ? true : existing.emailOptIn,
      })
      .where(eq(contacts.id, existing.id))
      .returning();
  } else {
    [contact] = await db
      .insert(contacts)
      .values({
        businessId,
        phone,
        name: name || null,
        email: email || null,
        smsOptIn: smsOptIn === "on",
        emailOptIn: emailOptIn === "on",
      })
      .returning();

    await db.insert(events).values({ businessId, contactId: contact.id, type: "signup" });

    if (business.smsEnabled && contact.smsOptIn) {
      await sendSms(
        contact.phone,
        `Thanks for visiting ${business.name}! Reply STOP to opt out.`,
        business.smsFromNumber,
      );
    }
    if (contact.emailOptIn && contact.email) {
      await sendEmail(
        contact.email,
        `Thanks for visiting ${business.name}`,
        `<p>Thanks for stopping by ${business.name}!</p>`,
      );
    }
  }

  // Remember who this is, so a later punch-tag tap — which lands on a URL that
  // knows nothing about the customer — can credit the right card without
  // making them re-enter their number at the counter.
  await setContactSession(businessId, contact.id);

  // Identifying is the second half of a punch tap for a first-time customer:
  // the tap was verified on page load, but there was nobody to credit yet.
  let punchAward: PunchAward | null = null;
  if (punchTap) {
    punchAward = await awardPunchTap(businessId, contact.id, punchTap.key, punchTap.counter);
  }

  return { status: "ready", data: await loadHubData(db, business, contact), punchAward };
}

// --- Redeeming ----------------------------------------------------------

export type RedeemResult =
  | { status: "error"; message: string }
  | { status: "ok"; reward: RewardView };

// The terminal step. Splitting this out of "approved" is what makes an old
// screenshot worthless: the code dies here, and every later look at it renders
// the already-redeemed screen instead.
export async function redeemReward(businessId: string, contactId: string): Promise<RedeemResult> {
  // A contact id is an unguessable uuid, but once the browser is carrying a
  // signed session there is no reason to keep trusting the client's copy of
  // it — a mismatch means this isn't the person whose card it is. Absent a
  // session (cookies blocked) this falls back to the id, as the claim actions
  // already do.
  const session = await getContactSession(businessId);
  if (session && session !== contactId) {
    return { status: "error", message: "Something went wrong — start over." };
  }

  const db = getDb();
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) return { status: "error", message: "Something went wrong." };

  return spendReward(db, business, contactId);
}

// --- Claiming -----------------------------------------------------------

export type ClaimResult =
  | { status: "error"; message: string }
  | { status: "already_done" }
  | { status: "cooldown"; minutesRemaining: number }
  | { status: "pending"; code: string }
  | { status: "stamped"; stampCount: number; punchGoal: number }
  | { status: "reward"; reward: RewardView };

export async function claimActivity(
  businessId: string,
  tagId: string | null,
  contactId: string,
  activityId: string,
): Promise<ClaimResult> {
  const db = getDb();
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) return { status: "error", message: "Something went wrong." };
  if (business.rewardMode !== "punch_card") return { status: "error", message: "Not available." };
  if (!availableActivities(toPublicBusiness(business)).some((a) => a.id === activityId)) {
    return { status: "error", message: "Not available." };
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.businessId, businessId)))
    .limit(1);
  if (!contact) return { status: "error", message: "Something went wrong — start over." };

  const [already] = await db
    .select()
    .from(redemptions)
    .where(
      and(
        eq(redemptions.businessId, businessId),
        eq(redemptions.contactId, contactId),
        eq(redemptions.activity, activityId),
      ),
    )
    .limit(1);
  if (already) return { status: "already_done" };

  return claimStamp(db, business, tagId, contactId, activityId);
}

export async function claimVisitStamp(
  businessId: string,
  tagId: string | null,
  contactId: string,
): Promise<ClaimResult> {
  const db = getDb();
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) return { status: "error", message: "Something went wrong." };
  if (business.rewardMode !== "punch_card") return { status: "error", message: "Not available." };

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.businessId, businessId)))
    .limit(1);
  if (!contact) return { status: "error", message: "Something went wrong — start over." };

  const [lastVisit] = await db
    .select()
    .from(redemptions)
    .where(
      and(
        eq(redemptions.businessId, businessId),
        eq(redemptions.contactId, contactId),
        eq(redemptions.activity, VISIT_ACTIVITY),
      ),
    )
    .orderBy(desc(redemptions.createdAt))
    .limit(1);

  if (lastVisit) {
    const availableAt = lastVisit.createdAt.getTime() + business.punchCooldownMinutes * 60_000;
    if (availableAt > Date.now()) {
      return {
        status: "cooldown",
        minutesRemaining: Math.max(1, Math.ceil((availableAt - Date.now()) / 60_000)),
      };
    }
  }

  return claimStamp(db, business, tagId, contactId, VISIT_ACTIVITY);
}

async function claimStamp(
  db: ReturnType<typeof getDb>,
  business: typeof businesses.$inferSelect,
  tagId: string | null,
  contactId: string,
  activity: string,
): Promise<ClaimResult> {
  const approved = business.redemptionMode === "honor";
  const code = generateRedemptionCode();

  await db.insert(redemptions).values({
    businessId: business.id,
    contactId,
    tagId,
    kind: "stamp",
    activity,
    code,
    status: approved ? "approved" : "pending",
    rewardSnapshot: business.rewardHeadline,
    approvedAt: approved ? new Date() : null,
  });
  await db
    .insert(events)
    .values({ businessId: business.id, contactId, tagId, type: "redemption_created" });

  if (!approved) return { status: "pending", code };

  const result = await awardStampAndMaybeIssueReward(db, {
    businessId: business.id,
    contactId,
    tagId,
    punchGoal: business.punchGoal,
    rewardHeadline: business.rewardHeadline,
    redemptionMode: business.redemptionMode,
  });

  if (result.rewardIssued) {
    return {
      status: "reward",
      reward: {
        redemptionId: result.rewardId,
        code: result.rewardCode,
        status: result.rewardApproved ? "approved" : "pending",
        redeemedAtIso: null,
        headline: business.rewardHeadline,
        description: business.rewardDescription,
      },
    };
  }
  return { status: "stamped", stampCount: result.stampCount, punchGoal: business.punchGoal };
}

export async function claimFlatReward(
  businessId: string,
  tagId: string | null,
  contactId: string,
): Promise<ClaimResult> {
  const db = getDb();
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) return { status: "error", message: "Something went wrong." };
  if (business.rewardMode !== "flat") return { status: "error", message: "Not available." };

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.businessId, businessId)))
    .limit(1);
  if (!contact) return { status: "error", message: "Something went wrong — start over." };

  const [already] = await db
    .select()
    .from(redemptions)
    .where(
      and(
        eq(redemptions.businessId, businessId),
        eq(redemptions.contactId, contactId),
        eq(redemptions.kind, "reward"),
      ),
    )
    .limit(1);
  if (already) {
    return {
      status: "reward",
      reward: toRewardView(already, business.rewardHeadline, business.rewardDescription),
    };
  }

  const approved = business.redemptionMode === "honor";
  const code = generateRedemptionCode();

  const [created] = await db
    .insert(redemptions)
    .values({
      businessId,
      contactId,
      tagId,
      kind: "reward",
      code,
      status: approved ? "approved" : "pending",
      rewardSnapshot: business.rewardHeadline,
      approvedAt: approved ? new Date() : null,
    })
    .returning();
  await db.insert(events).values({ businessId, contactId, tagId, type: "redemption_created" });

  return {
    status: "reward",
    reward: toRewardView(created, business.rewardHeadline, business.rewardDescription),
  };
}

export async function logActivityClick(
  businessId: string,
  tagId: string | null,
  activityId: string,
): Promise<void> {
  const db = getDb();
  await db.insert(events).values({ businessId, tagId, type: "review_click", platform: activityId });
}
