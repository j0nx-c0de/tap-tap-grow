import { getDb } from "@/db";
import {
  METRIC_WINDOWS,
  eventSeries,
  loadDashboardMetrics,
  type MetricWindow,
} from "@/lib/metrics";
import { MetricCard, StatTile } from "@/app/components/metrics/kpi-tile";
import { PlatformBreakdown, TrendChart } from "@/app/components/metrics/charts";
import { PeriodSelector } from "@/app/components/metrics/period-selector";

// One business's numbers, rendered identically wherever they're shown — the
// operator's view under /admin and the business owner's own view under
// /owner are the same figures, so they're the same component. `basePath` is
// all that differs: it's what the period selector writes `?w=` onto.
export async function BusinessStats({
  businessId,
  basePath,
  window,
  heading = "Stats",
}: {
  businessId: string;
  basePath: string;
  window: MetricWindow;
  heading?: string;
}) {
  const windowLabel = METRIC_WINDOWS.find((w) => w.key === window)!.label.toLowerCase();
  const db = getDb();

  const [metrics, reviewSeries, returnSeries] = await Promise.all([
    loadDashboardMetrics(db, businessId, window),
    eventSeries(db, businessId, "review_click", window),
    eventSeries(db, businessId, "punch_tap", window),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <PeriodSelector active={window} basePath={basePath} />
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatTile label="NFC tags" value={metrics.tagCount} />
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
    </>
  );
}
