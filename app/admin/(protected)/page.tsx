import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { businesses, contacts, redemptions } from "@/db/schema";

export default async function AdminHomePage() {
  const db = getDb();
  const list = await db.select().from(businesses).orderBy(desc(businesses.createdAt));

  const withStats = await Promise.all(
    list.map(async (b) => {
      const contactCount = await db.$count(contacts, eq(contacts.businessId, b.id));
      const pendingCount = await db.$count(
        redemptions,
        and(eq(redemptions.businessId, b.id), eq(redemptions.status, "pending")),
      );
      return { ...b, contactCount, pendingCount };
    }),
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Businesses</h1>
        <Link
          href="/admin/businesses/new"
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          + New business
        </Link>
      </div>

      {withStats.length === 0 ? (
        <p className="mt-8 text-muted">No businesses yet — add your first one.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {withStats.map((b) => (
            <li key={b.id}>
              <Link
                href={`/admin/businesses/${b.id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent"
              >
                <div>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-sm text-muted">/staff/{b.slug}</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span>{b.contactCount} contacts</span>
                  {b.pendingCount > 0 && (
                    <span className="rounded-full bg-accent/15 px-2.5 py-1 font-medium text-accent">
                      {b.pendingCount} pending
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
