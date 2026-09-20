import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, events, punchCards, punchTags, redemptions, tags } from "@/db/schema";
import { activityLabel } from "@/lib/activities";

type Db = ReturnType<typeof getDb>;

export type MetricWindow = "7d" | "30d" | "12m";

export const METRIC_WINDOWS: { key: MetricWindow; label: string; days: number }[] = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "12m", label: "Last 12 months", days: 365 },
];

export function parseMetricWindow(value: string | undefined): MetricWindow {
  return value === "7d" || value === "12m" ? value : "30d";
}

// businessId === null scopes a query across every business, for the admin
// rollup; a string scopes it to one business's own dashboard.
type Scope = string | null;

type Range = { start: Date; end: Date };

// offset 0 is the selected window itself; offset 1 is the equal-length
// window immediately before it, for the "vs prior period" comparison —
// contiguous with no gap or overlap between the two.
function windowRange(window: MetricWindow, offset: 0 | 1 = 0): Range {
  const days = METRIC_WINDOWS.find((w) => w.key === window)!.days;
  const dayMs = 24 * 60 * 60 * 1000;
  const end = new Date(Date.now() - offset * days * dayMs);
  const start = new Date(end.getTime() - days * dayMs);
  return { start, end };
}

export type PeriodMetrics = { current: number; previous: number };

async function currentAndPrevious(
  fn: (range: Range) => Promise<number>,
  range: Range,
  prevRange: Range,
): Promise<PeriodMetrics> {
  const [current, previous] = await Promise.all([fn(range), fn(prevRange)]);
  return { current, previous };
}

export async function reviewTapsByPlatform(
  db: Db,
  businessId: Scope,
  range: Range,
): Promise<{ platform: string; label: string; count: number }[]> {
  const rows = await db
    .select({ platform: events.platform, count: sql<number>`count(*)::int` })
    .from(events)
    .where(
      and(
        eq(events.type, "review_click"),
        businessId ? eq(events.businessId, businessId) : undefined,
        gte(events.createdAt, range.start),
        lt(events.createdAt, range.end),
      ),
    )
    .groupBy(events.platform);

  return rows
    .map((r) => ({
      platform: r.platform ?? "unknown",
      label: activityLabel(r.platform),
      count: r.count,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function reviewTapsTotal(db: Db, businessId: Scope, range: Range): Promise<number> {
  const rows = await reviewTapsByPlatform(db, businessId, range);
  return rows.reduce((sum, r) => sum + r.count, 0);
}

export async function returnTapsTotal(db: Db, businessId: Scope, range: Range): Promise<number> {
  const base = and(eq(events.type, "punch_tap"), gte(events.createdAt, range.start), lt(events.createdAt, range.end));
  return businessId ? db.$count(events, and(base, eq(events.businessId, businessId))) : db.$count(events, base);
}

// A stamp actually landed on a card — status has moved past 'pending', i.e.
// staff confirmed it (or the business runs on the honor system and it was
// approved immediately). Distinct from returnTapsTotal, which counts every
// verified tap of the tag regardless of whether it produced a stamp.
export async function punchesAwardedTotal(db: Db, businessId: Scope, range: Range): Promise<number> {
  const base = and(
    eq(redemptions.kind, "stamp"),
    sql`${redemptions.status} <> 'pending'`,
    gte(redemptions.createdAt, range.start),
    lt(redemptions.createdAt, range.end),
  );
  return businessId ? db.$count(redemptions, and(base, eq(redemptions.businessId, businessId))) : db.$count(redemptions, base);
}

// Denominator for the "average ... per customer" metrics: everyone
// currently enrolled in a punch card at the business (or across all
// businesses), not just those active within the window — punch_tap events
// are anonymous at insert time (verified before we know who's holding the
// phone), so a true per-contact rate isn't derivable from them.
export async function punchCardCustomerCount(db: Db, businessId: Scope): Promise<number> {
  return businessId ? db.$count(punchCards, eq(punchCards.businessId, businessId)) : db.$count(punchCards);
}

export async function tagCount(db: Db, businessId: Scope): Promise<number> {
  const [hub, dna] = await Promise.all([
    businessId
      ? db.$count(tags, eq(tags.businessId, businessId))
      : db.$count(tags, isNotNull(tags.businessId)),
    businessId ? db.$count(punchTags, eq(punchTags.businessId, businessId)) : db.$count(punchTags),
  ]);
  return hub + dna;
}

export async function businessCount(db: Db): Promise<number> {
  return db.$count(businesses);
}

// Everything a dashboard page (admin rollup or a single business) needs, in
// one call, for one selected window. `businessId: null` means "across every
// business." Each time-based metric carries the prior equal-length window
// alongside it so the UI can show a delta, not just a raw number.
export async function loadDashboardMetrics(db: Db, businessId: Scope, window: MetricWindow) {
  const range = windowRange(window, 0);
  const prevRange = windowRange(window, 1);

  const [reviewTaps, returnTaps, punches, cardCustomers, tagCountValue, businessCountValue, platformBreakdown] =
    await Promise.all([
      currentAndPrevious((r) => reviewTapsTotal(db, businessId, r), range, prevRange),
      currentAndPrevious((r) => returnTapsTotal(db, businessId, r), range, prevRange),
      currentAndPrevious((r) => punchesAwardedTotal(db, businessId, r), range, prevRange),
      punchCardCustomerCount(db, businessId),
      tagCount(db, businessId),
      businessId ? Promise.resolve(1) : businessCount(db),
      reviewTapsByPlatform(db, businessId, range),
    ]);

  const perCustomer = (m: PeriodMetrics): PeriodMetrics =>
    cardCustomers === 0
      ? { current: 0, previous: 0 }
      : { current: m.current / cardCustomers, previous: m.previous / cardCustomers };

  const perBusiness = (m: PeriodMetrics): PeriodMetrics =>
    businessCountValue === 0
      ? { current: 0, previous: 0 }
      : { current: m.current / businessCountValue, previous: m.previous / businessCountValue };

  return {
    reviewTaps,
    avgReviewTapsPerBusiness: businessId ? null : perBusiness(reviewTaps),
    returnTaps,
    avgReturnTapsPerCustomer: perCustomer(returnTaps),
    punches,
    avgPunchesPerCustomer: perCustomer(punches),
    punchCardCustomerCount: cardCustomers,
    tagCount: tagCountValue,
    businessCount: businessCountValue,
    platformBreakdown,
  };
}

// Daily-bucketed counts, gaps filled with 0 so the chart always renders a
// full, continuous axis.
async function dailyEventSeries(
  db: Db,
  businessId: Scope,
  type: "review_click" | "punch_tap",
  days: number,
): Promise<{ date: string; count: number }[]> {
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const bucket = sql<string>`to_char(date_trunc('day', ${events.createdAt}), 'YYYY-MM-DD')`;

  const rows = await db
    .select({ day: bucket, count: sql<number>`count(*)::int` })
    .from(events)
    .where(
      and(eq(events.type, type), businessId ? eq(events.businessId, businessId) : undefined, gte(events.createdAt, start)),
    )
    .groupBy(bucket);

  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: byDay.get(key) ?? 0 });
  }
  return out;
}

// Trend/sparkline series matched to the selected window. 12mo stays daily
// under the hood (one query, same as 7d/30d) but is downsampled to weekly
// points here — 365 daily points is too dense to read at either chart size.
// Chunking walks backward from today so a partial week (365 isn't a multiple
// of 7) lands on the oldest point rather than truncating the most recent one.
export async function eventSeries(
  db: Db,
  businessId: Scope,
  type: "review_click" | "punch_tap",
  window: MetricWindow,
): Promise<{ date: string; count: number }[]> {
  const days = METRIC_WINDOWS.find((w) => w.key === window)!.days;
  const daily = await dailyEventSeries(db, businessId, type, days);
  if (window !== "12m") return daily;

  const weekly: { date: string; count: number }[] = [];
  for (let end = daily.length; end > 0; end -= 7) {
    const chunk = daily.slice(Math.max(0, end - 7), end);
    weekly.push({ date: chunk[0].date, count: chunk.reduce((sum, d) => sum + d.count, 0) });
  }
  return weekly.reverse();
}

export type BusinessRollupRow = {
  id: string;
  name: string;
  slug: string;
  reviewTaps30d: number;
  returnTaps30d: number;
  punches30d: number;
  tagCount: number;
};

// Grouped aggregate queries instead of one round-trip per business per
// metric — that N+1 shape (4 queries × N businesses) is the kind of thing
// that's invisible at demo scale and expensive once there are real
// customers on the rollup page.
export async function loadBusinessRollup(db: Db): Promise<BusinessRollupRow[]> {
  const { start } = windowRange("30d", 0);
  // Drizzle's inferred type for tags.businessId stays `string | null` even
  // under the isNotNull filter below (it doesn't narrow on WHERE clauses) —
  // this filters defensively so the same helper serves both that query and
  // the other three, whose businessId columns are genuinely NOT NULL.
  const byBusiness = (rows: { businessId: string | null; count: number }[]) =>
    new Map(rows.flatMap((r) => (r.businessId ? [[r.businessId, r.count] as const] : [])));

  const [list, reviewRows, returnRows, punchRows, tagRows, punchTagRows] = await Promise.all([
    db.select({ id: businesses.id, name: businesses.name, slug: businesses.slug }).from(businesses),
    db
      .select({ businessId: events.businessId, count: sql<number>`count(*)::int` })
      .from(events)
      .where(and(eq(events.type, "review_click"), gte(events.createdAt, start)))
      .groupBy(events.businessId),
    db
      .select({ businessId: events.businessId, count: sql<number>`count(*)::int` })
      .from(events)
      .where(and(eq(events.type, "punch_tap"), gte(events.createdAt, start)))
      .groupBy(events.businessId),
    db
      .select({ businessId: redemptions.businessId, count: sql<number>`count(*)::int` })
      .from(redemptions)
      .where(and(eq(redemptions.kind, "stamp"), sql`${redemptions.status} <> 'pending'`, gte(redemptions.createdAt, start)))
      .groupBy(redemptions.businessId),
    db
      .select({ businessId: tags.businessId, count: sql<number>`count(*)::int` })
      .from(tags)
      .where(isNotNull(tags.businessId))
      .groupBy(tags.businessId),
    db
      .select({ businessId: punchTags.businessId, count: sql<number>`count(*)::int` })
      .from(punchTags)
      .groupBy(punchTags.businessId),
  ]);

  const reviewByBiz = byBusiness(reviewRows);
  const returnByBiz = byBusiness(returnRows);
  const punchByBiz = byBusiness(punchRows);
  const tagByBiz = byBusiness(tagRows);
  const punchTagByBiz = byBusiness(punchTagRows);

  return list.map((b) => ({
    ...b,
    reviewTaps30d: reviewByBiz.get(b.id) ?? 0,
    returnTaps30d: returnByBiz.get(b.id) ?? 0,
    punches30d: punchByBiz.get(b.id) ?? 0,
    tagCount: (tagByBiz.get(b.id) ?? 0) + (punchTagByBiz.get(b.id) ?? 0),
  }));
}
