import { and, desc, eq } from "drizzle-orm";
import type { getDb } from "@/db";
import { businesses, contacts, punchCards, redemptions } from "@/db/schema";
import { VISIT_ACTIVITY } from "@/lib/activities";
import { getContactSession } from "@/lib/auth";
import { isRewardVisible, toRewardView, type RewardView } from "@/lib/redemption";

export type ContactHubData = {
  contactId: string;
  name: string | null;
  stampCount: number;
  completedActivityIds: string[];
  // Precomputed server-side so the client never needs to call Date.now()
  // during render (React's purity rules disallow that) — 0 means available.
  visitCooldownMinutes: number;
  // The customer's outstanding reward, whatever state it's in: waiting on
  // staff, earned and unspent, or spent and now only useful as proof of when.
  reward: RewardView | null;
};

// Deliberately not in the "use server" actions module. Everything exported
// from one of those becomes a callable endpoint, and this returns a contact's
// name, stamp count and live reward code — not something to expose behind
// nothing but a guessed id.
// The card for whoever this browser last identified as at this business, or
// null if it's never identified here. Lets a page skip the identify form for
// someone who has already filled it in once — the cookie is set at identify
// and lasts a year, so a regular shouldn't be re-asked on every visit.
export async function loadSessionHubData(
  db: ReturnType<typeof getDb>,
  business: typeof businesses.$inferSelect,
): Promise<ContactHubData | null> {
  const contactId = await getContactSession(business.id);
  if (!contactId) return null;

  // Scoped to this business as well as the id: the cookie is per business,
  // but a contact id from elsewhere should never resolve here.
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.businessId, business.id)))
    .limit(1);
  if (!contact) return null;

  return loadHubData(db, business, contact);
}

export async function loadHubData(
  db: ReturnType<typeof getDb>,
  business: typeof businesses.$inferSelect,
  contact: typeof contacts.$inferSelect,
): Promise<ContactHubData> {
  let stampCount = 0;
  let completedActivityIds: string[] = [];
  let visitCooldownMinutes = 0;

  if (business.rewardMode === "punch_card") {
    const [pc] = await db
      .select()
      .from(punchCards)
      .where(and(eq(punchCards.businessId, business.id), eq(punchCards.contactId, contact.id)))
      .limit(1);
    stampCount = pc?.stampCount ?? 0;

    const stampRows = await db
      .select({ activity: redemptions.activity, createdAt: redemptions.createdAt })
      .from(redemptions)
      .where(
        and(
          eq(redemptions.businessId, business.id),
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
  }

  // Surfaced for every reward mode, not just flat. A punch-card customer who
  // filled their card and then closed the page used to come back to a reset
  // card with no sign of the reward they had earned — the reward row existed,
  // nothing ever showed it to them again.
  let reward: RewardView | null = null;
  if (business.rewardMode !== "none") {
    const [row] = await db
      .select()
      .from(redemptions)
      .where(
        and(
          eq(redemptions.businessId, business.id),
          eq(redemptions.contactId, contact.id),
          eq(redemptions.kind, "reward"),
        ),
      )
      .orderBy(desc(redemptions.createdAt))
      .limit(1);

    if (row && isRewardVisible(row, business.rewardMode, Date.now())) {
      reward = toRewardView(row, business.rewardHeadline, business.rewardDescription);
    }
  }

  return {
    contactId: contact.id,
    name: contact.name,
    stampCount,
    completedActivityIds,
    visitCooldownMinutes,
    reward,
  };
}
