"use client";

import { useEffect, useState } from "react";
import { PROOF_WINDOW_MS, type RewardView } from "@/lib/redemption";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// The one hook that reads wall-clock time, and it does so only inside an
// effect — never in a render body, which React treats as impure. Everything
// downstream just formats the number this hands back.
function useTick(active: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    // Both clock reads happen in timer callbacks rather than synchronously in
    // the effect body — the latter is a cascading render, and the render path
    // itself has to stay free of Date.now() anyway.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active]);

  return now;
}

export function RewardCard({
  businessName,
  reward,
  onRedeem,
  redeeming,
}: {
  businessName: string;
  reward: RewardView;
  onRedeem: () => void;
  redeeming: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const redeemedAt = reward.redeemedAtIso ? Date.parse(reward.redeemedAtIso) : null;
  const now = useTick(reward.status === "redeemed");

  // --- Waiting on staff to confirm the underlying claim -------------------
  if (reward.status === "pending") {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">{businessName}</p>
        <p className="mt-3 text-lg font-medium text-balance">{reward.headline}</p>
        {reward.description && <p className="mt-1 text-sm text-muted">{reward.description}</p>}
        <p className="mt-6 rounded-xl border border-dashed border-border bg-background py-4 font-mono text-4xl font-semibold tracking-[0.3em]">
          {reward.code}
        </p>
        <p className="mt-4 text-sm text-muted">
          Show this code to staff &mdash; they&apos;ll confirm it at the register, then you can redeem.
        </p>
      </div>
    );
  }

  // --- Earned and unspent: the deliberate, one-way redeem step ------------
  if (reward.status === "approved") {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-accent bg-card p-8 text-center shadow-sm">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">{businessName}</p>
        <p className="mt-3 text-2xl font-semibold text-balance">{reward.headline}</p>
        {reward.description && <p className="mt-1 text-sm text-muted">{reward.description}</p>}
        <p className="mt-6 rounded-xl border border-dashed border-border bg-background py-4 font-mono text-4xl font-semibold tracking-[0.3em]">
          {reward.code}
        </p>

        {armed ? (
          <>
            <p className="mt-6 text-sm font-medium text-danger">
              Only tap this with staff watching &mdash; it cannot be undone.
            </p>
            <button
              type="button"
              onClick={onRedeem}
              disabled={redeeming}
              className="mt-3 w-full rounded-full bg-danger px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {redeeming ? "Redeeming…" : "Yes — redeem it now"}
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="mt-2 w-full text-xs text-muted hover:text-foreground"
            >
              Not yet
            </button>
          </>
        ) : (
          <>
            <p className="mt-6 text-sm text-muted">Tap below when you are at the register.</p>
            <button
              type="button"
              onClick={() => setArmed(true)}
              className="mt-3 w-full rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              Redeem my reward
            </button>
          </>
        )}
      </div>
    );
  }

  // --- Spent. Everything below is about proving *when*. -------------------

  // First paint, before the effect has read the clock. Renders neutral rather
  // than guessing, so it never flashes the wrong verdict at a staff member.
  if (now === null || redeemedAt === null) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">{businessName}</p>
        <p className="mt-6 text-sm text-muted">Checking&hellip;</p>
      </div>
    );
  }

  const remaining = PROOF_WINDOW_MS - (now - redeemedAt);

  if (remaining <= 0) {
    const then = new Date(redeemedAt);
    const sameDay = new Date(now).toDateString() === then.toDateString();
    const when = then.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const day = sameDay ? "today" : then.toLocaleDateString([], { month: "short", day: "numeric" });

    return (
      <div className="w-full max-w-sm rounded-2xl border-2 border-danger bg-card p-8 text-center shadow-sm">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">{businessName}</p>
        <p className="mt-4 text-2xl font-bold uppercase tracking-wide text-danger">Already redeemed</p>
        <p className="mt-2 text-base font-medium">
          Claimed {day} at {when}
        </p>
        <p className="mt-6 font-mono text-2xl tracking-[0.3em] text-muted line-through">{reward.code}</p>
        <p className="mt-6 border-t border-border pt-4 text-sm text-muted">
          This reward has already been given out. Do not honour this screen.
        </p>
      </div>
    );
  }

  const secs = Math.ceil(remaining / 1000);
  const clock = new Date(now);

  return (
    <div className="w-full max-w-sm rounded-2xl border-2 border-accent bg-card p-8 text-center shadow-sm">
      <p className="font-mono text-xs uppercase tracking-widest text-accent">{businessName}</p>
      <p className="mt-3 text-xl font-semibold text-balance">{reward.headline}</p>
      {reward.description && <p className="mt-1 text-sm text-muted">{reward.description}</p>}

      <div className="relative mx-auto mt-6 h-36 w-36">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <circle cx="50" cy="50" r="45" fill="none" strokeWidth="6" className="stroke-border" />
          {/* A continuously rotating arc rather than a slow progress ring: over
              a ten-minute window a progress sweep would crawl too slowly to
              read as movement, and movement is the entire tell. */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="70 213"
            className="tl-sweep stroke-accent"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-semibold tabular-nums">
            {clock.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </span>
          <span className="mt-0.5 text-xs text-muted tabular-nums">
            {Math.floor(secs / 60)}:{pad(secs % 60)} left
          </span>
        </div>
      </div>

      <p className="mt-6 rounded-xl border border-dashed border-accent bg-background py-4 font-mono text-4xl font-semibold tracking-[0.3em]">
        {reward.code}
      </p>

      <p className="mt-6 border-t border-border pt-4 text-sm font-medium">
        Staff: this screen must be moving.
      </p>
      <p className="mt-1 text-xs text-muted">
        A screenshot cannot animate, and its clock will be wrong.
      </p>
    </div>
  );
}
