import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import { logReviewClick } from "@/lib/activities";
import { toPublicBusiness } from "@/lib/business";

// Every review/social link on the hub routes through here instead of
// linking straight to Google/Yelp/etc. Logging happens server-side, before
// the redirect is issued, so the click can't be lost to the browser
// abandoning an in-flight `<a onClick>` beacon the instant it navigates away.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string; activity: string }> },
) {
  const { businessId, activity } = await params;
  if (!UUID_RE.test(businessId)) return new NextResponse("Not found", { status: 404 });

  const db = getDb();
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) return new NextResponse("Not found", { status: 404 });

  const tagParam = request.nextUrl.searchParams.get("tag");
  const tagId = tagParam && UUID_RE.test(tagParam) ? tagParam : null;

  // Doubles as validation: an activity id with no configured URL 404s here
  // rather than logging a click for a link that doesn't exist.
  const match = await logReviewClick(db, toPublicBusiness(business), { tagId, activityId: activity });
  if (!match) return new NextResponse("Not found", { status: 404 });

  return NextResponse.redirect(match.url, 302);
}
