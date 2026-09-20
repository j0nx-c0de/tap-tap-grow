import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import { toPublicBusiness } from "@/lib/business";
import { loadSessionHubData } from "@/lib/hub-data";
import { Hub } from "@/app/t/[tagId]/hub";

// A saved link to your own card, so "how many stamps do I have?" is
// answerable from the couch rather than only while standing in the shop.
//
// Deliberately keyed on the business's slug rather than a tag id: tags are
// reassignable now, so a bookmarked /t/[tagId] could quietly start pointing
// at a different business's card after that sticker was re-claimed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CardPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;

  const db = getDb();
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, businessSlug))
    .limit(1);
  if (!business) notFound();

  // No session (a new device, cleared cookies) falls through to the ordinary
  // identify form, which doubles as the recovery path: identifying upserts on
  // (business, phone), so the same number lands back on the same card rather
  // than starting a second one.
  const hub = await loadSessionHubData(db, business);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Hub
        business={toPublicBusiness(business)}
        tagId={null}
        initialHub={hub}
        identifyCopy={{
          title: "Find your card",
          body: "Enter the number you signed up with and we'll pull up your stamps.",
        }}
      />
    </main>
  );
}
