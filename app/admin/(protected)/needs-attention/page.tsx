import Link from "next/link";
import { getDb } from "@/db";
import { isStale, loadPendingRedemptions } from "@/lib/redemptions";
import { relativeTime } from "@/lib/time";

export default async function NeedsAttentionPage() {
  const db = getDb();
  const rows = await loadPendingRedemptions(db);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Needs attention</h1>
      <p className="mt-1 text-sm text-muted">
        Redemptions waiting on staff to approve, oldest first, across every business.
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 text-muted">Nothing pending — every business is caught up.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {rows.map((r) => {
            const stale = isStale(r.createdAt);
            return (
              <li key={r.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/businesses/${r.businessId}`}
                      className="font-medium text-accent hover:opacity-80"
                    >
                      {r.businessName}
                    </Link>
                    <p className="mt-1 text-sm text-foreground">{r.rewardSnapshot}</p>
                    <p className="mt-1 text-xs text-muted">
                      {r.activityLabel} · {r.contactName || r.contactPhone || "—"} ·{" "}
                      <span className="font-mono">{r.code}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-medium ${stale ? "text-danger" : "text-muted"}`}>
                      {relativeTime(r.createdAt)}
                    </p>
                    <Link
                      href={`/staff/${r.businessSlug}`}
                      className="mt-1 inline-block text-xs text-accent hover:opacity-80"
                    >
                      Staff console →
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
