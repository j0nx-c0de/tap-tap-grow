import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import { isOwnerAuthed } from "@/lib/auth";
import { parseMetricWindow } from "@/lib/metrics";
import { maskEmail, maskPhone } from "@/lib/owner-login";
import { BusinessStats } from "@/app/components/business-stats";
import { signOutOwner } from "./actions";
import { SignIn } from "./sign-in";

// The URL is public even though what's behind it isn't — no reason for it to
// turn up in a search result.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function OwnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ w?: string; expired?: string }>;
}) {
  const { businessSlug } = await params;
  const sp = await searchParams;
  const window = parseMetricWindow(sp.w);

  const db = getDb();
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, businessSlug))
    .limit(1);
  if (!business) notFound();

  if (!(await isOwnerAuthed(business.id))) {
    return (
      <SignIn
        businessSlug={businessSlug}
        businessName={business.name}
        maskedEmail={business.ownerEmail ? maskEmail(business.ownerEmail) : null}
        maskedPhone={business.ownerPhone ? maskPhone(business.ownerPhone) : null}
        expired={sp.expired === "1"}
      />
    );
  }

  const signOut = signOutOwner.bind(null, businessSlug);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">{business.name}</p>
        <form action={signOut}>
          <button type="submit" className="text-sm text-muted hover:text-foreground">
            Sign out
          </button>
        </form>
      </div>
      <BusinessStats
        businessId={business.id}
        basePath={`/owner/${businessSlug}`}
        window={window}
        heading="Your results"
      />
    </div>
  );
}
