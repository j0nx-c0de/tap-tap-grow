import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, contacts, redemptions } from "@/db/schema";
import { activityLabel } from "@/lib/activities";

type Db = ReturnType<typeof getDb>;

export type PendingRedemptionRow = {
  id: string;
  code: string;
  activityLabel: string;
  rewardSnapshot: string;
  createdAt: Date;
  businessId: string;
  businessName: string;
  businessSlug: string;
  contactName: string | null;
  contactPhone: string | null;
};

// Every pending redemption across every business, oldest first — these are
// staff_verified claims waiting on that business's own staff to approve via
// their console (see app/staff/[businessSlug]/console.tsx). The admin can't
// approve on their behalf — verifying the underlying claim happened is the
// whole point of staff_verified mode — so this is a visibility tool ("which
// businesses have a customer waiting") rather than an action queue.
export async function loadPendingRedemptions(db: Db): Promise<PendingRedemptionRow[]> {
  const rows = await db
    .select({
      id: redemptions.id,
      code: redemptions.code,
      kind: redemptions.kind,
      activity: redemptions.activity,
      rewardSnapshot: redemptions.rewardSnapshot,
      createdAt: redemptions.createdAt,
      businessId: businesses.id,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      contactName: contacts.name,
      contactPhone: contacts.phone,
    })
    .from(redemptions)
    .innerJoin(businesses, eq(redemptions.businessId, businesses.id))
    .leftJoin(contacts, eq(redemptions.contactId, contacts.id))
    .where(eq(redemptions.status, "pending"))
    .orderBy(asc(redemptions.createdAt));

  return rows.map(({ kind, activity, ...r }) => ({
    ...r,
    activityLabel: kind === "reward" ? "Reward" : activityLabel(activity) || "Stamp",
  }));
}

// Past this age a pending redemption is worth the operator following up on
// directly rather than just noting — a customer has been waiting a while.
const STALE_HOURS = 48;

export function isStale(date: Date): boolean {
  return date.getTime() < Date.now() - STALE_HOURS * 60 * 60 * 1000;
}
