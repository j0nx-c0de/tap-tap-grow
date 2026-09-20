import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db";
import { businesses, tags } from "@/db/schema";
import { logReviewClick } from "@/lib/activities";
import { toPublicBusiness } from "@/lib/business";
import { loadSessionHubData } from "@/lib/hub-data";
import { Hub } from "./hub";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A tag id that exists but has no business bound yet — batch-printed
// inventory waiting to be claimed at a business's sign-up, not a broken link.
function UnclaimedTag() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-balance">This tag isn&apos;t set up yet</h1>
        <p className="mt-3 text-sm text-muted">
          Ask whoever gave you this to finish setting it up.
        </p>
      </div>
    </main>
  );
}

export default async function TapPage({ params }: { params: Promise<{ tagId: string }> }) {
  const { tagId } = await params;
  if (!UUID_RE.test(tagId)) notFound();

  const db = getDb();
  const [tag] = await db.select().from(tags).where(eq(tags.id, tagId)).limit(1);
  if (!tag) notFound();

  // Drizzle query builders are lazy — they only run once awaited/`.then()`'d —
  // so this has to be awaited rather than fired-and-forgotten with `void`,
  // or the update never actually executes.
  await db
    .update(tags)
    .set({ tapCount: tag.tapCount + 1, lastTappedAt: new Date() })
    .where(eq(tags.id, tag.id));

  if (!tag.businessId) return <UnclaimedTag />;

  const [business] = await db.select().from(businesses).where(eq(businesses.id, tag.businessId)).limit(1);
  // Defensive only — businesses.id cascades onto tags.businessId, so a
  // claimed tag pointing at a since-deleted business shouldn't be reachable.
  if (!business) notFound();

  const publicBusiness = toPublicBusiness(business);

  if (tag.directActivity) {
    const match = await logReviewClick(db, publicBusiness, { tagId: tag.id, activityId: tag.directActivity });
    // A match redirects straight to the destination. No match (the business
    // stopped offering this activity after the tag was claimed) falls
    // through to the normal hub below rather than erroring.
    if (match) redirect(match.url);
  }

  // A returning customer's browser already knows who they are, so the form
  // has nothing to ask — same treatment /p/[key] has always given a repeat
  // tap of a punch tag.
  const hub = await loadSessionHubData(db, business);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Hub business={publicBusiness} tagId={tag.id} initialHub={hub} />
    </main>
  );
}
