"use client";

import { useRef, useState, type PointerEvent } from "react";

export type Series = {
  key: string;
  label: string;
  color: string;
  points: { date: string; count: number }[];
};

const WIDTH = 600;
const HEIGHT = 220;
const PAD_LEFT = 32;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 20;

function niceMax(n: number): number {
  if (n <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(n));
  const residual = n / magnitude;
  const step = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return step * magnitude;
}

// A hand-rolled line chart rather than a charting dependency — one axis,
// a crosshair that snaps to the nearest day, and a legend since this always
// renders two or more series. See the dataviz skill's marks-and-anatomy and
// interaction references for the specs this follows (2px lines, hairline
// gridlines, line-key tooltip rows, surface-ring end markers).
export function TrendChart({ title, series }: { title: string; series: Series[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const n = series[0]?.points.length ?? 0;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.count))));
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xAt = (i: number) => PAD_LEFT + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => PAD_TOP + plotH - (v / max) * plotH;

  function handleMove(e: PointerEvent<SVGSVGElement>) {
    const svg = ref.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = Math.min(1, Math.max(0, (px - PAD_LEFT) / plotW));
    setHoverIndex(Math.round(ratio * (n - 1)));
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <div className="flex items-center gap-3">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted">
              <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative mt-3">
        <svg
          ref={ref}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full touch-none"
          onPointerMove={handleMove}
          onPointerLeave={() => setHoverIndex(null)}
          role="img"
          aria-label={title}
        >
          {[0, 0.5, 1].map((g) => (
            <line
              key={g}
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={PAD_TOP + plotH * (1 - g)}
              y2={PAD_TOP + plotH * (1 - g)}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
          ))}
          <text x={2} y={PAD_TOP + 4} fontSize={10} fill="var(--viz-muted)">
            {Math.round(max)}
          </text>
          <text x={2} y={PAD_TOP + plotH + 4} fontSize={10} fill="var(--viz-muted)">
            0
          </text>

          {series.map((s) => (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.points.map((p, i) => `${xAt(i)},${yAt(p.count)}`).join(" ")}
            />
          ))}

          {series.map((s) => {
            const last = s.points[s.points.length - 1];
            if (!last) return null;
            return (
              <circle
                key={`${s.key}-end`}
                cx={xAt(s.points.length - 1)}
                cy={yAt(last.count)}
                r={4}
                fill={s.color}
                stroke="var(--viz-surface)"
                strokeWidth={2}
              />
            );
          })}

          {hoverIndex !== null && (
            <>
              <line
                x1={xAt(hoverIndex)}
                x2={xAt(hoverIndex)}
                y1={PAD_TOP}
                y2={PAD_TOP + plotH}
                stroke="var(--viz-baseline)"
                strokeWidth={1}
              />
              {series.map((s) => {
                const p = s.points[hoverIndex];
                if (!p) return null;
                return (
                  <circle
                    key={`${s.key}-hover`}
                    cx={xAt(hoverIndex)}
                    cy={yAt(p.count)}
                    r={4}
                    fill={s.color}
                    stroke="var(--viz-surface)"
                    strokeWidth={2}
                  />
                );
              })}
            </>
          )}
        </svg>

        {hoverIndex !== null && series[0]?.points[hoverIndex] && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-32 rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-sm"
            style={{ left: `${(xAt(hoverIndex) / WIDTH) * 100}%`, transform: "translate(-50%, -100%)" }}
          >
            <p className="font-medium text-foreground">{series[0].points[hoverIndex].date}</p>
            {series.map((s) => (
              <p key={s.key} className="mt-0.5 flex items-center gap-1.5 text-muted">
                <span className="inline-block h-0.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-medium text-foreground">{s.points[hoverIndex]?.count ?? 0}</span>
                {s.label}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// A minimal trend indicator for a MetricCard — no axis, gridlines, or
// tooltip, since the card next to it already shows the number and delta.
// aria-hidden because it's decorative in that context, not a second source
// of information a screen reader needs to announce.
export function Sparkline({ points, color }: { points: { count: number }[]; color: string }) {
  const w = 80;
  const h = 24;
  const max = Math.max(1, ...points.map((p) => p.count));
  const xAt = (i: number) => (points.length <= 1 ? 0 : (i / (points.length - 1)) * w);
  const yAt = (v: number) => h - (v / max) * h;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-20 shrink-0" aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.map((p, i) => `${xAt(i)},${yAt(p.count)}`).join(" ")}
      />
    </svg>
  );
}

// Color follows the platform's identity, not its rank in the sorted list —
// so Google is always the same hue whether it's first or last this week.
const PLATFORM_COLORS: Record<string, string> = {
  google_review: "var(--viz-series-1)",
  yelp_review: "var(--viz-series-2)",
  facebook_review: "var(--viz-series-3)",
  follow_instagram: "var(--viz-series-4)",
  follow_tiktok: "var(--viz-series-5)",
};

export function PlatformBreakdown({
  data,
  windowLabel,
}: {
  data: { platform: string; label: string; count: number }[];
  windowLabel: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">No review or follow clicks yet in the {windowLabel}.</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => {
        const color = PLATFORM_COLORS[d.platform] ?? "var(--viz-muted)";
        return (
          <div key={d.platform}>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-foreground">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                {d.label || d.platform}
              </span>
              <span className="font-medium tabular-nums text-foreground">{d.count}</span>
            </div>
            <div
              className="mt-1 h-3 w-full overflow-hidden rounded-full bg-background"
              role="img"
              aria-label={`${d.label}: ${d.count} clicks`}
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${(d.count / max) * 100}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
