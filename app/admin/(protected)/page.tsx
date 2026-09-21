import Link from "next/link";
import { getDb } from "@/db";
import { eventSeries, loadDashboardMetrics } from "@/lib/metrics";
import { loadPendingRedemptions, isStale } from "@/lib/redemptions";
import { relativeTime } from "@/lib/time";
import { MetricCard } from "@/app/components/metrics/kpi-tile";

// A daily-glance window, not the configurable one Dashboard offers — this
// page answers "how's it going lately," not "let me pick a range."
const OVERVIEW_WINDOW = "7d" as const;
const NEEDS_ATTENTION_PREVIEW = 5;

export default async function AdminOverviewPage() {
  const db = getDb();
  const [metrics, reviewSeries, returnSeries, pending] = await Promise.all([
    loadDashboardMetrics(db, null, OVERVIEW_WINDOW),
    eventSeries(db, null, "review_click", OVERVIEW_WINDOW),
    eventSeries(db, null, "punch_tap", OVERVIEW_WINDOW),
    loadPendingRedemptions(db),
  ]);
  const preview = pending.slice(0, NEEDS_ATTENTION_PREVIEW);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="mt-1 text-sm text-muted">Across all {metrics.businessCount} businesses, last 7 days.</p>
        </div>
        {/* Same destination as the primary button on /admin/businesses
            (the reviews-only quick add — the doorstep flow), just louder:
            this is the page you land on, so it's the button most likely to
            get tapped mid-pitch. */}
        <Link
          href="/admin/businesses/quick"
          className="shrink-0 rounded-full bg-[#f5620a] px-6 py-3 text-base font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          + New Business
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Review taps"
          current={metrics.reviewTaps.current}
          previous={metrics.reviewTaps.previous}
          sparkline={{ points: reviewSeries, color: "var(--viz-series-1)" }}
        />
        <MetricCard
          label="Return taps"
          current={metrics.returnTaps.current}
          previous={metrics.returnTaps.previous}
          sparkline={{ points: returnSeries, color: "var(--viz-series-3)" }}
        />
        <MetricCard label="Punches awarded" current={metrics.punches.current} previous={metrics.punches.previous} />
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Needs attention</h2>
          {pending.length > 0 && (
            <Link href="/admin/needs-attention" className="text-sm text-accent hover:opacity-80">
              See all {pending.length} →
            </Link>
          )}
        </div>

        {preview.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing pending — every business is caught up.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {preview.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm"
              >
                <div className="min-w-0 truncate">
                  <Link href={`/admin/businesses/${r.businessId}`} className="font-medium text-accent hover:opacity-80">
                    {r.businessName}
                  </Link>
                  <span className="ml-2 text-muted">{r.rewardSnapshot}</span>
                </div>
                <span className={`shrink-0 text-xs font-medium ${isStale(r.createdAt) ? "text-danger" : "text-muted"}`}>
                  {relativeTime(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link href="/admin/businesses" className="text-accent hover:opacity-80">
          All businesses →
        </Link>
        <Link href="/admin/dashboard" className="text-accent hover:opacity-80">
          Full dashboard →
        </Link>
      </div>
    </div>
  );
}
