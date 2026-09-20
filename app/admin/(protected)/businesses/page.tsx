import Link from "next/link";
import { getDb } from "@/db";
import { searchBusinesses } from "@/lib/businesses";
import { SearchBox } from "../search-box";

export default async function BusinessesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const db = getDb();
  const list = await searchBusinesses(db, q);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Businesses</h1>
        {/* Two doors, because they are different jobs. The reviews-only
            path is the one used standing in a doorway, so it gets the
            primary button; full setup is for a business that already said
            yes to a punch card. */}
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/admin/businesses/new"
            className="rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Full setup
          </Link>
          <Link
            href="/admin/businesses/quick"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            + Reviews only
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <SearchBox defaultValue={q ?? ""} />
      </div>

      {list.length === 0 ? (
        <p className="mt-8 text-muted">
          {q ? `No businesses match "${q}".` : "No businesses yet — add your first one."}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {list.map((b) => (
            <li key={b.id}>
              <Link
                href={`/admin/businesses/${b.id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent"
              >
                <div className="min-w-0">
                  <p className="font-medium">{b.name}</p>
                  {/* The address sits directly under the name because that's
                      the pair you read together when two rows are called
                      almost the same thing. */}
                  <p className="text-sm text-muted">{b.addressLine || "No address on file"}</p>
                  <p className="text-xs text-muted">/staff/{b.slug}</p>
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
