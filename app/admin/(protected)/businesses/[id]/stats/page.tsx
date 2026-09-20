import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import { parseMetricWindow } from "@/lib/metrics";
import { BusinessStats } from "@/app/components/business-stats";

export default async function BusinessStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const { id } = await params;
  const window = parseMetricWindow((await searchParams).w);

  const db = getDb();
  const [business] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
  if (!business) notFound();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href={`/admin/businesses/${id}`} className="mb-2 block text-sm text-muted hover:text-foreground">
        ← {business.name}
      </Link>
      <BusinessStats businessId={id} basePath={`/admin/businesses/${id}/stats`} window={window} />
    </div>
  );
}
