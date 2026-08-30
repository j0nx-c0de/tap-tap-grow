import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, events, punchTags, redemptions } from "@/db/schema";
import { VISIT_ACTIVITY } from "@/lib/activities";
import { generateRedemptionCode } from "@/lib/codes";
import { awardStampAndMaybeIssueReward } from "@/lib/punch-card";
import { verifySun } from "@/lib/sun";

export type TapVerification =
  | { ok: true; businessId: string; punchTagKey: string; counter: number }
  | { ok: false; reason: "unknown_tag" | "invalid" | "replay" | "wrong_chip" };

// Verify a tap and burn its counter. Called once, on page load, before we have
// any idea who is holding the phone — so this deliberately does not award
// anything. It only establishes "a genuine tap of this business's tag just
// happened, and this exact tap has not been seen before."
export async function verifyPunchTap(
  key: string,
  piccDataHex: string,
  cmacHex: string,
): Promise<TapVerification> {
  const db = getDb();
  const [tag] = await db.select().from(punchTags).where(eq(punchTags.key, key)).limit(1);
  if (!tag) return { ok: false, reason: "unknown_tag" };

  const result = verifySun({
    sdmMetaKeyHex: tag.sdmMetaKey,
    sdmFileKeyHex: tag.sdmFileKey,
    piccDataHex,
    cmacHex,
  });
  if (!result.ok) return { ok: false, reason: "invalid" };

  // The keys alone aren't identity — pin the chip UID on first sight so a
  // second chip provisioned with the same keys can't stamp for this business.
  if (tag.uid && tag.uid !== result.uid) return { ok: false, reason: "wrong_chip" };

  // Conditional update is the replay check: the chip's counter only ever
  // increases, so a URL replayed from history loses this race by definition.
  // Doing it as one guarded UPDATE rather than read-then-write means two
  // simultaneous taps can't both pass.
  const updated = await db
    .update(punchTags)
    .set({
      lastCounter: result.counter,
      uid: result.uid,
      tapCount: sql`${punchTags.tapCount} + 1`,
      lastTappedAt: new Date(),
    })
    .where(and(eq(punchTags.id, tag.id), lt(punchTags.lastCounter, result.counter)))
    .returning();

  if (updated.length === 0) return { ok: false, reason: "replay" };

  await db.insert(events).values({ businessId: tag.businessId, type: "punch_tap" });

  return { ok: true, businessId: tag.businessId, punchTagKey: tag.key, counter: result.counter };
}

export type PunchAward =
  | { status: "stamped"; stampCount: number; punchGoal: number }
  | { status: "reward"; code: string; headline: string; description: string | null }
  | { status: "cooldown"; minutesRemaining: number }
  | { status: "already_awarded" }
  | { status: "error"; message: string };

// Turn an already-verified tap into a stamp for a known contact.
//
// Split from verification because the two can happen in different requests: a
// first-time customer taps, gets the identify form, and only then is there a
// contact to credit. `lastAwardedCounter` makes that second half single-use.
export async function awardPunchTap(
  businessId: string,
  contactId: string,
  punchTagKey: string,
  counter: number,
): Promise<PunchAward> {
  const db = getDb();

  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) return { status: "error", message: "Something went wrong." };
  if (business.rewardMode !== "punch_card") {
    return { status: "error", message: "This business isn't running a punch card." };
  }

  // A tap proves presence, not that staff meant to give a second stamp — and
  // if the tag is placed customer-side, nothing stops someone tapping it ten
  // times in a row. The business's existing visit cooldown covers both.
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
    const remaining = availableAt - Date.now();
    if (remaining > 0) {
      return { status: "cooldown", minutesRemaining: Math.max(1, Math.ceil(remaining / 60_000)) };
    }
  }

  // Claim this counter. Requires it to still be the most recent verified tap
  // and to not have been cashed in already, so reloading the page or sharing
  // the URL after identifying can't produce a second stamp.
  const claimed = await db
    .update(punchTags)
    .set({ lastAwardedCounter: counter })
    .where(
      and(
        eq(punchTags.key, punchTagKey),
        eq(punchTags.businessId, businessId),
        eq(punchTags.lastCounter, counter),
        lt(punchTags.lastAwardedCounter, counter),
      ),
    )
    .returning();

  if (claimed.length === 0) return { status: "already_awarded" };

  // The tap itself is the verification, so the stamp lands approved even for a
  // staff_verified business — that's the whole point of handing them a tag
  // instead of a console to tick things off in. Same reasoning carries to the
  // reward the stamp may complete: every stamp behind it was proven, so it
  // goes straight to "ready to redeem" rather than back into a pending queue.
  await db.insert(redemptions).values({
    businessId,
    contactId,
    kind: "stamp",
    activity: VISIT_ACTIVITY,
    code: generateRedemptionCode(),
    status: "approved",
    rewardSnapshot: business.rewardHeadline,
    approvedAt: new Date(),
  });
  await db.insert(events).values({ businessId, contactId, type: "redemption_created" });

  const result = await awardStampAndMaybeIssueReward(db, {
    businessId,
    contactId,
    tagId: null,
    punchGoal: business.punchGoal,
    rewardHeadline: business.rewardHeadline,
    redemptionMode: "honor",
  });

  if (result.rewardIssued) {
    return {
      status: "reward",
      code: result.rewardCode,
      headline: business.rewardHeadline,
      description: business.rewardDescription,
    };
  }
  return { status: "stamped", stampCount: result.stampCount, punchGoal: business.punchGoal };
}
