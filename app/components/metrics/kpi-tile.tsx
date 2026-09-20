import { Sparkline } from "./charts";

function formatValue(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

// Up is good for every metric this currently renders (taps, punches — more
// is always better), so the color mapping doesn't need a per-metric
// direction flag. Revisit if a "lower is better" metric shows up.
export function DeltaChip({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    if (current === 0) return null;
    return <span className="text-xs font-medium text-muted">New</span>;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-xs font-medium text-muted">No change</span>;
  const up = pct > 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-medium"
      style={{ color: up ? "var(--viz-good)" : "var(--viz-critical)" }}
    >
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

// The dashboard's primary metric display: one hero number for the selected
// window, a delta against the prior equal-length window, and (for metrics
// backed by a daily event series) a trend sparkline. `compact` renders the
// same shape at a smaller scale for secondary "rate" metrics (per-business,
// per-customer averages) that don't carry their own series.
export function MetricCard({
  label,
  current,
  previous,
  sublabel,
  sparkline,
  compact,
}: {
  label: string;
  current: number;
  previous: number;
  sublabel?: string;
  sparkline?: { points: { count: number }[]; color: string };
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p className={compact ? "text-xl font-semibold text-foreground" : "text-3xl font-semibold text-foreground"}>
            {formatValue(current)}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <DeltaChip current={current} previous={previous} />
            {sublabel && <span className="text-xs text-muted">{sublabel}</span>}
          </div>
        </div>
        {sparkline && <Sparkline points={sparkline.points} color={sparkline.color} />}
      </div>
    </div>
  );
}

export function StatTile({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-muted">{sublabel}</p>}
    </div>
  );
}
