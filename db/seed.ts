import { getDb } from "./index";
import { businesses, tags } from "./schema";

async function main() {
  const db = getDb();

  const [business] = await db
    .insert(businesses)
    .values({
      name: "Demo Coffee Co.",
      slug: "demo-coffee",
      googleReviewUrl: "https://search.google.com/local/writereview?placeid=REPLACE_ME",
      yelpReviewUrl: "https://www.yelp.com/writeareview/biz/REPLACE_ME",
      instagramUrl: "https://instagram.com/REPLACE_ME",
      tiktokUrl: "https://tiktok.com/@REPLACE_ME",
      rewardMode: "punch_card",
      rewardHeadline: "Free coffee on your 10th stamp",
      punchGoal: 10,
      punchCooldownMinutes: 60,
    })
    .returning();

  const createdTags = await db
    .insert(tags)
    .values([{ businessId: business.id, type: "hub", label: "Front counter" }])
    .returning();

  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  console.log(`Seeded "${business.name}" (staff PIN: ${business.staffPin})`);
  console.log(`  admin   -> ${base}/admin/businesses/${business.id}`);
  console.log(`  staff   -> ${base}/staff/${business.slug}`);
  for (const t of createdTags) {
    console.log(`  tap     -> ${base}/t/${t.id}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
