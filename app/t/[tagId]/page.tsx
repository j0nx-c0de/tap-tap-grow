import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { businesses, tags } from "@/db/schema";
import { toPublicBusiness } from "@/lib/business";
import { Hub } from "./hub";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TapPage({ params }: { params: Promise<{ tagId: string }> }) {
  const { tagId } = await params;
  if (!UUID_RE.test(tagId)) notFound();

  const db = getDb();
  const rows = await db
    .select({ tag: tags, business: businesses })
    .from(tags)
    .innerJoin(businesses, eq(tags.businessId, businesses.id))
    .where(eq(tags.id, tagId))
    .limit(1);

  if (rows.length === 0) notFound();
  const { tag, business } = rows[0];

  // Drizzle query builders are lazy — they only run once awaited/`.then()`'d —
  // so this has to be awaited rather than fired-and-forgotten with `void`,
  // or the update never actually executes.
  await db
    .update(tags)
    .set({ tapCount: tag.tapCount + 1, lastTappedAt: new Date() })
    .where(eq(tags.id, tag.id));

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Hub business={toPublicBusiness(business)} tagId={tag.id} />
    </main>
  );
}
