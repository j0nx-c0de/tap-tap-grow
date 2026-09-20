import Link from "next/link";
import { getDb } from "@/db";
import {
  METRIC_WINDOWS,
  eventSeries,
  loadBusinessRollup,
  loadDashboardMetrics,
  parseMetricWindow,
  type BusinessRollupRow,
} from "@/lib/metrics";
import { MetricCard, StatTile } from "@/app/components/metrics/kpi-tile";
import { PlatformBreakdown, TrendChart } from "@/app/components/metrics/charts";
import { PeriodSelector } from "@/app/components/metrics/period-selector";

type SortKey = "name" | "reviewTaps30d" | "returnTaps30d" | "punches30d" | "tagCount";
type SortDir = "asc" | "desc";

// Numeric columns default to descending on first click (biggest first is
// the useful read); name defaults to ascending (A→Z).
const SORTABLE_COLUMNS: { key: SortKey; label: string; defaultDir: SortDir }[] = [
  { key: "name", label: "Business", defaultDir: "asc" },
  { key: "reviewTaps30d", label: "Review taps (30d)", defaultDir: "desc" },
  { key: "returnTaps30d", label: "Return taps (30d)", defaultDir: "desc" },
  { key: "punches30d", label: "Punches (30d)", defaultDir: "desc" },
  { key: "tagCount", label: "NFC tags", defaultDir: "desc" },
];

function parseSort(value: string | undefined): SortKey {
  return SORTABLE_COLUMNS.some((c) => c.key === value) ? (value as SortKey) : "name";
}

function parseDir(value: string | undefined): SortDir {
  return value === "desc" ? "desc" : "asc";
}

function sortRollup(rows: BusinessRollupRow[], sort: SortKey, dir: SortDir): BusinessRollupRow[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name) * mult;
    return (a[sort] - b[sort]) * mult;
  });
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const window = parseMetricWindow(sp.w);
  const windowLabel = METRIC_WINDOWS.find((w) => w.key === window)!.label.toLowerCase();
  const sortKey = parseSort(sp.sort);
  const sortDir = parseDir(sp.dir);

  const db = getDb();
  const [metrics, rollup, reviewSeries, returnSeries] = await Promise.all([
    loadDashboardMetrics(db, null, window),
    loadBusinessRollup(db),
    eventSeries(db, null, "review_click", window),
    eventSeries(db, null, "punch_tap", window),
  ]);
  const sortedRollup = sortRollup(rollup, sortKey, sortDir);

  // Sort links need to carry the active period window along; other params
  // (sort/dir) always come from the clicked column, never from the current URL.
  function sortHref(col: (typeof SORTABLE_COLUMNS)[number]): string {
    const nextDir: SortDir = sortKey === col.key ? (sortDir === "asc" ? "desc" : "asc") : col.defaultDir;
    const params = new URLSearchParams();
    if (window !== "30d") params.set("w", window);
    params.set("sort", col.key);
    params.set("dir", nextDir);
    return `/admin/dashboard?${params.toString()}`;
  }

  const avgReviewTapsPerBusiness = metrics.avgReviewTapsPerBusiness ?? { current: 0, previous: 0 };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Across all {metrics.businessCount} businesses.</p>
        </div>
        <PeriodSelector active={window} basePath="/admin/dashboard" />
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

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MetricCard
          compact
          label="Avg review taps / business"
          current={avgReviewTapsPerBusiness.current}
          previous={avgReviewTapsPerBusiness.previous}
        />
        <MetricCard
          compact
          label="Avg return taps / customer"
          current={metrics.avgReturnTapsPerCustomer.current}
          previous={metrics.avgReturnTapsPerCustomer.previous}
          sublabel={`across ${metrics.punchCardCustomerCount} enrolled`}
        />
        <MetricCard
          compact
          label="Avg punches / customer"
          current={metrics.avgPunchesPerCustomer.current}
          previous={metrics.avgPunchesPerCustomer.previous}
          sublabel={`across ${metrics.punchCardCustomerCount} enrolled`}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatTile label="Businesses" value={metrics.businessCount} />
        <StatTile label="NFC tags in the field" value={metrics.tagCount} />
        <StatTile label="Punch card customers" value={metrics.punchCardCustomerCount} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <TrendChart
          title={`Taps, ${windowLabel}`}
          series={[
            { key: "review", label: "Review taps", color: "var(--viz-series-1)", points: reviewSeries },
            { key: "return", label: "Punch-card return taps", color: "var(--viz-series-3)", points: returnSeries },
          ]}
        />
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">Review &amp; follow clicks by platform, {windowLabel}</p>
          <div className="mt-3">
            <PlatformBreakdown data={metrics.platformBreakdown} windowLabel={windowLabel} />
          </div>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Businesses</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-xs uppercase tracking-wide text-muted">
              <tr>
                {SORTABLE_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={col.key === "name" ? "px-4 py-3 font-medium" : "px-4 py-3 text-right font-medium"}
                    aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    <Link
                      href={sortHref(col)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {col.label}
                      {sortKey === col.key && <span aria-hidden="true">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRollup.map((b) => (
                <tr key={b.id} className="border-t border-border transition-colors hover:bg-foreground/5">
                  <td className="px-4 py-3">
                    <Link href={`/admin/businesses/${b.id}/stats`} className="font-medium text-accent hover:opacity-80">
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.reviewTaps30d}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.returnTaps30d}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.punches30d}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.tagCount}</td>
                </tr>
              ))}
              {sortedRollup.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    No businesses yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
