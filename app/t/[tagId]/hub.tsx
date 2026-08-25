"use client";

import { useRef, useState, useTransition } from "react";
import type { PublicBusiness } from "@/lib/business";
import { availableActivities, VISIT_ACTIVITY } from "@/lib/activities";
import { ClaimResult } from "./claim-result";
import {
  claimActivity,
  claimFlatReward,
  claimVisitStamp,
  identifyContact,
  logActivityClick,
  type ContactHubData,
} from "./actions";

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent";

type RewardResult = { code: string; approved: boolean; headline: string; description: string | null };

export function Hub({ business, tagId }: { business: PublicBusiness; tagId: string }) {
  const [hub, setHub] = useState<ContactHubData | null>(null);
  const [reward, setReward] = useState<RewardResult | null>(null);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const phoneRef = useRef<HTMLInputElement>(null);

  function handleIdentify(formData: FormData) {
    startTransition(async () => {
      const result = await identifyContact(business.id, { status: "idle" }, formData);
      if (result.status === "error") {
        setIdentifyError(result.message);
        return;
      }
      if (result.status === "ready") {
        try {
          localStorage.setItem("mc_phone", String(formData.get("phone") ?? ""));
        } catch {
          // ignore
        }
        setIdentifyError(null);
        setHub(result.data);
        if (result.data.flatRewardCode) {
          setReward({
            code: result.data.flatRewardCode,
            approved: !!result.data.flatRewardApproved,
            headline: business.rewardHeadline,
            description: business.rewardDescription,
          });
        }
      }
    });
  }

  if (reward) {
    return (
      <ClaimResult
        businessName={business.name}
        code={reward.code}
        approved={reward.approved}
        headline={reward.headline}
        description={reward.description}
      />
    );
  }

  if (!hub) {
    let prefill = "";
    try {
      prefill = localStorage.getItem("mc_phone") ?? "";
    } catch {
      // ignore
    }
    return (
      <form
        action={handleIdentify}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm"
      >
        <p className="font-mono text-xs uppercase tracking-widest text-accent">{business.name}</p>
        <h1 className="mt-3 text-2xl font-semibold text-balance">
          {business.rewardMode === "none" ? "Leave us a review" : "Get on the list"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {business.rewardMode === "punch_card"
            ? "Tell us who you are and start earning stamps."
            : business.rewardMode === "flat"
              ? "Tell us who you are, then claim your reward below."
              : "We'd love your feedback — leave us your info and hop to a review link below."}
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Name <span className="font-normal text-muted">(optional)</span>
            <input name="name" autoComplete="name" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Phone
            <input
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              ref={phoneRef}
              defaultValue={prefill}
              placeholder="(555) 123-4567"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email <span className="font-normal text-muted">(optional)</span>
            <input name="email" type="email" autoComplete="email" className={inputClass} />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="smsOptIn" defaultChecked className="mt-1" />
            Text me updates and offers. Reply STOP anytime to opt out.
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="emailOptIn" className="mt-1" />
            Email me too
          </label>
        </div>

        {identifyError && <p className="mt-4 text-sm text-danger">{identifyError}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Continuing…" : "Continue"}
        </button>
      </form>
    );
  }

  return (
    <ReadyHub
      business={business}
      tagId={tagId}
      hub={hub}
      setHub={setHub}
      setReward={setReward}
      pending={pending}
      startTransition={startTransition}
    />
  );
}

function ReadyHub({
  business,
  tagId,
  hub,
  setHub,
  setReward,
  pending,
  startTransition,
}: {
  business: PublicBusiness;
  tagId: string;
  hub: ContactHubData;
  setHub: (h: ContactHubData) => void;
  setReward: (r: RewardResult) => void;
  pending: boolean;
  startTransition: (fn: () => void | Promise<void>) => void;
}) {
  const activities = availableActivities(business);
  const [pendingCodes, setPendingCodes] = useState<Record<string, string>>({});
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [visitMessage, setVisitMessage] = useState<string | null>(null);

  function afterClaim(activity: string, result: Awaited<ReturnType<typeof claimActivity>>) {
    if (result.status === "error") {
      setVisitMessage(result.message);
      return;
    }
    if (result.status === "already_done") {
      setHub({ ...hub, completedActivityIds: [...new Set([...hub.completedActivityIds, activity])] });
      return;
    }
    if (result.status === "cooldown") {
      setHub({ ...hub, visitCooldownMinutes: result.minutesRemaining });
      setVisitMessage(`You already got a stamp on this visit — come back in about ${result.minutesRemaining} min.`);
      return;
    }
    if (result.status === "pending") {
      setPendingCodes((prev) => ({ ...prev, [activity]: result.code }));
      return;
    }
    if (result.status === "stamped") {
      setHub({
        ...hub,
        stampCount: result.stampCount,
        completedActivityIds:
          activity === VISIT_ACTIVITY ? hub.completedActivityIds : [...hub.completedActivityIds, activity],
        visitCooldownMinutes:
          activity === VISIT_ACTIVITY ? business.punchCooldownMinutes : hub.visitCooldownMinutes,
      });
      return;
    }
    if (result.status === "reward") {
      setReward({
        code: result.code,
        approved: result.approved,
        headline: result.headline,
        description: result.description,
      });
    }
  }

  function claim(activityId: string) {
    setClaimingId(activityId);
    setVisitMessage(null);
    startTransition(async () => {
      const result = await claimActivity(business.id, tagId, hub.contactId, activityId);
      afterClaim(activityId, result);
      setClaimingId(null);
    });
  }

  function claimVisit() {
    setClaimingId(VISIT_ACTIVITY);
    setVisitMessage(null);
    startTransition(async () => {
      const result = await claimVisitStamp(business.id, tagId, hub.contactId);
      afterClaim(VISIT_ACTIVITY, result);
      setClaimingId(null);
    });
  }

  function claimFlat() {
    setClaimingId("flat");
    startTransition(async () => {
      const result = await claimFlatReward(business.id, tagId, hub.contactId);
      if (result.status === "reward") {
        setReward({
          code: result.code,
          approved: result.approved,
          headline: result.headline,
          description: result.description,
        });
      } else if (result.status === "error") {
        setVisitMessage(result.message);
      }
      setClaimingId(null);
    });
  }

  const activityLinks = (
    <div className="mt-6 flex flex-col gap-2">
      {activities.length === 0 && <p className="text-sm text-muted">Nothing to do here yet.</p>}
      {activities.map((a) => {
        const done = hub.completedActivityIds.includes(a.id);
        const pendingCode = pendingCodes[a.id];
        return (
          <div key={a.id} className="rounded-lg border border-border px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void logActivityClick(business.id, tagId, a.id)}
                className="text-sm font-medium transition-colors hover:text-accent"
              >
                {a.label} ↗
              </a>
              {business.rewardMode === "punch_card" &&
                (done ? (
                  <span className="text-xs font-medium text-accent">✓ Done</span>
                ) : pendingCode ? (
                  <span className="text-xs text-muted">Pending</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => claim(a.id)}
                    disabled={pending && claimingId === a.id}
                    className="shrink-0 text-xs font-medium text-accent hover:opacity-80 disabled:opacity-50"
                  >
                    {pending && claimingId === a.id ? "…" : "I did this"}
                  </button>
                ))}
            </div>
            {pendingCode && (
              <p className="mt-1 font-mono text-xs text-muted">
                Show <span className="font-semibold text-foreground">{pendingCode}</span> to staff to confirm.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );

  if (business.rewardMode === "none") {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">{business.name}</p>
        <h1 className="mt-3 text-2xl font-semibold text-balance">Thanks, {hub.name?.split(" ")[0] || "friend"}!</h1>
        <p className="mt-2 text-sm text-muted">If you have a minute, we&apos;d really appreciate it:</p>
        {activityLinks}
      </div>
    );
  }

  if (business.rewardMode === "flat") {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">{business.name}</p>
        <h1 className="mt-3 text-2xl font-semibold text-balance">{business.rewardHeadline}</h1>
        {business.rewardDescription && <p className="mt-2 text-sm text-muted">{business.rewardDescription}</p>}
        {activityLinks}
        {visitMessage && <p className="mt-4 text-sm text-danger">{visitMessage}</p>}
        <button
          type="button"
          onClick={claimFlat}
          disabled={pending && claimingId === "flat"}
          className="mt-6 w-full rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending && claimingId === "flat" ? "Claiming…" : "I did this — claim my reward"}
        </button>
      </div>
    );
  }

  // punch_card
  const onCooldown = hub.visitCooldownMinutes > 0;

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
      <p className="font-mono text-xs uppercase tracking-widest text-accent">{business.name}</p>
      <h1 className="mt-3 text-xl font-semibold text-balance">{business.rewardHeadline}</h1>
      {business.rewardDescription && <p className="mt-1 text-sm text-muted">{business.rewardDescription}</p>}

      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${Math.min(100, (hub.stampCount / business.punchGoal) * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted">
          {hub.stampCount} of {business.punchGoal} stamps
        </p>
      </div>

      <button
        type="button"
        onClick={claimVisit}
        disabled={pending && claimingId === VISIT_ACTIVITY}
        className="mt-4 w-full rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending && claimingId === VISIT_ACTIVITY ? "Adding…" : "Get a stamp for this visit"}
      </button>
      {pendingCodes[VISIT_ACTIVITY] && (
        <p className="mt-1 text-center font-mono text-xs text-muted">
          Show <span className="font-semibold text-foreground">{pendingCodes[VISIT_ACTIVITY]}</span> to staff to
          confirm.
        </p>
      )}
      {visitMessage && <p className="mt-2 text-center text-sm text-danger">{visitMessage}</p>}
      {onCooldown && !visitMessage && (
        <p className="mt-2 text-center text-xs text-muted">
          Next visit stamp in about {hub.visitCooldownMinutes} min.
        </p>
      )}

      {activities.length > 0 && (
        <>
          <p className="mt-6 text-sm font-medium">Also earn a stamp by:</p>
          {activityLinks}
        </>
      )}
    </div>
  );
}
