"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { businesses, contacts, events, punchCards, redemptions } from "@/db/schema";
import { availableActivities, VISIT_ACTIVITY } from "@/lib/activities";
import { toPublicBusiness } from "@/lib/business";
import { generateRedemptionCode } from "@/lib/codes";
import { sendEmail } from "@/lib/email";
import { isPlausiblePhone, normalizePhone } from "@/lib/phone";
import { awardStampAndMaybeIssueReward } from "@/lib/punch-card";
import { sendSms } from "@/lib/sms";

// --- Identify (opt-in capture, runs once per visit before anything else) --

const identifySchema = z.object({
  phone: z.string().trim().min(7, "Enter a valid phone number").max(20),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).optional(),
  smsOptIn: z.literal("on").optional(),
  emailOptIn: z.literal("on").optional(),
});

export type ContactHubData = {
  contactId: string;
  name: string | null;
  stampCount: number;
  completedActivityIds: string[];
  // Precomputed server-side so the client never needs to call Date.now()
  // during render (React's purity rules disallow that) — 0 means available.
  visitCooldownMinutes: number;
  flatRewardCode: string | null;
  flatRewardApproved: boolean | null;
};

export type IdentifyState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ContactHubData };

export async function identifyContact(
  businessId: string,
  _prev: IdentifyState,
  formData: FormData,
): Promise<IdentifyState> {
  const parsed = identifySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your details and try again." };
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

  let stampCount = 0;
  let completedActivityIds: string[] = [];
  let visitCooldownMinutes = 0;
  let flatRewardCode: string | null = null;
  let flatRewardApproved: boolean | null = null;

  if (business.rewardMode === "punch_card") {
    const [pc] = await db
      .select()
      .from(punchCards)
      .where(and(eq(punchCards.businessId, businessId), eq(punchCards.contactId, contact.id)))
      .limit(1);
    stampCount = pc?.stampCount ?? 0;

    const stampRows = await db
      .select({ activity: redemptions.activity, createdAt: redemptions.createdAt })
      .from(redemptions)
      .where(
        and(
          eq(redemptions.businessId, businessId),
          eq(redemptions.contactId, contact.id),
          eq(redemptions.kind, "stamp"),
        ),
      );

    completedActivityIds = stampRows
      .filter((r) => r.activity && r.activity !== VISIT_ACTIVITY)
      .map((r) => r.activity as string);

    const visits = stampRows
      .filter((r) => r.activity === VISIT_ACTIVITY)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (visits.length > 0) {
      const availableAt = visits[0].createdAt.getTime() + business.punchCooldownMinutes * 60_000;
      visitCooldownMinutes = Math.max(0, Math.ceil((availableAt - Date.now()) / 60_000));
    }
  } else if (business.rewardMode === "flat") {
    const [existingReward] = await db
      .select()
      .from(redemptions)
      .where(
        and(
          eq(redemptions.businessId, businessId),
          eq(redemptions.contactId, contact.id),
          eq(redemptions.kind, "reward"),
        ),
      )
      .limit(1);
    if (existingReward) {
      flatRewardCode = existingReward.code;
      flatRewardApproved = existingReward.status === "approved";
    }
  }

  return {
    status: "ready",
    data: {
      contactId: contact.id,
      name: contact.name,
      stampCount,
      completedActivityIds,
      visitCooldownMinutes,
      flatRewardCode,
      flatRewardApproved,
    },
  };
}

// --- Claiming ----------------------------------------------------------

export type ClaimResult =
  | { status: "error"; message: string }
  | { status: "already_done" }
  | { status: "cooldown"; minutesRemaining: number }
  | { status: "pending"; code: string }
  | { status: "stamped"; stampCount: number; punchGoal: number }
  | { status: "reward"; code: string; approved: boolean; headline: string; description: string | null };

export async function claimActivity(
  businessId: string,
  tagId: string,
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
  tagId: string,
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
      return { status: "cooldown", minutesRemaining: Math.max(1, Math.ceil((availableAt - Date.now()) / 60_000)) };
    }
  }

  return claimStamp(db, business, tagId, contactId, VISIT_ACTIVITY);
}

async function claimStamp(
  db: ReturnType<typeof getDb>,
  business: typeof businesses.$inferSelect,
  tagId: string,
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
  await db.insert(events).values({ businessId: business.id, contactId, tagId, type: "redemption_created" });

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
      code: result.rewardCode,
      approved: result.rewardApproved,
      headline: business.rewardHeadline,
      description: business.rewardDescription,
    };
  }
  return { status: "stamped", stampCount: result.stampCount, punchGoal: business.punchGoal };
}

export async function claimFlatReward(
  businessId: string,
  tagId: string,
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
      code: already.code,
      approved: already.status === "approved",
      headline: business.rewardHeadline,
      description: business.rewardDescription,
    };
  }

  const approved = business.redemptionMode === "honor";
  const code = generateRedemptionCode();

  await db.insert(redemptions).values({
    businessId,
    contactId,
    tagId,
    kind: "reward",
    code,
    status: approved ? "approved" : "pending",
    rewardSnapshot: business.rewardHeadline,
    approvedAt: approved ? new Date() : null,
  });
  await db.insert(events).values({ businessId, contactId, tagId, type: "redemption_created" });

  return { status: "reward", code, approved, headline: business.rewardHeadline, description: business.rewardDescription };
}

export async function logActivityClick(businessId: string, tagId: string, activityId: string): Promise<void> {
  const db = getDb();
  await db.insert(events).values({ businessId, tagId, type: "review_click", platform: activityId });
}
