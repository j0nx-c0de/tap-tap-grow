import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import { setOwnerSession } from "@/lib/auth";
import { consumeToken } from "@/lib/owner-login";

// Where an emailed magic link lands. This has to be a route handler rather
// than a page: a cookie can't be set during a Server Component render, and
// setting the session is the whole job.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ businessSlug: string }> },
) {
  const { businessSlug } = await params;
  const token = request.nextUrl.searchParams.get("token") ?? "";

  const db = getDb();
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, businessSlug))
    .limit(1);
  if (!business) return new NextResponse("Not found", { status: 404 });

  const dashboard = new URL(`/owner/${businessSlug}`, request.nextUrl.origin);

  if (token) {
    const result = await consumeToken(db, business.id, "email", token);
    if (result.ok) {
      await setOwnerSession(business.id);
      return NextResponse.redirect(dashboard, 303);
    }
  }

  // A dead link (used, expired, or wrong) just drops them on the sign-in
  // screen with a nudge, rather than a dead end — the fix is always the
  // same, ask for a fresh one.
  dashboard.searchParams.set("expired", "1");
  return NextResponse.redirect(dashboard, 303);
}
