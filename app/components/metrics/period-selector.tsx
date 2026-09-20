import Link from "next/link";
import { METRIC_WINDOWS, type MetricWindow } from "@/lib/metrics";

// Server-rendered segmented control — writes `?w=` and lets the page re-fetch
// with the new window, rather than a client-side toggle over pre-fetched
// data. Simpler, and every window this switches between needs its own
// queries anyway (the trend series length differs, not just which slice of
// one dataset is shown).
export function PeriodSelector({ active, basePath }: { active: MetricWindow; basePath: string }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
      {METRIC_WINDOWS.map((w) => (
        <Link
          key={w.key}
          href={w.key === "30d" ? basePath : `${basePath}?w=${w.key}`}
          className={
            w.key === active
              ? "rounded-md bg-accent px-3 py-1 font-medium text-accent-foreground"
              : "rounded-md px-3 py-1 text-muted transition-colors hover:text-foreground"
          }
        >
          {w.key.toUpperCase()}
        </Link>
      ))}
    </div>
  );
}
