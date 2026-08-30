"use client";

import { useRef, useState, useTransition } from "react";
import type { PublicBusiness } from "@/lib/business";
import { availableActivities, VISIT_ACTIVITY } from "@/lib/activities";
import type { PunchAward } from "@/lib/punch-tag";
import { RewardCard } from "./reward-card";
import {
  claimActivity,
  claimFlatReward,
  claimVisitStamp,
  identifyContact,
  logActivityClick,
  redeemReward,
  type ContactHubData,
  type PunchTapContext,
} from "./actions";

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent";

function punchAwardMessage(award: PunchAward, punchGoal: number): string {
  switch (award.status) {
    case "stamped":
      return `Stamp added — ${award.stampCount} of ${punchGoal}.`;
    case "reward":
      return "That filled your card!";
    case "cooldown":
      return `You've already been stamped for this visit — next one in about ${award.minutesRemaining} min.`;
    case "already_awarded":
      return "That tap has already been counted.";
    case "error":
      return award.message;
  }
}

export function Hub({
  business,
  tagId,
  punchTap = null,
  initialHub = null,
  initialPunchAward = null,
}: {
  business: PublicBusiness;
  // Null when the customer arrived by tapping a DNA punch tag rather than one
  // of the business's ordinary hub tags.
  tagId: string | null;
  punchTap?: PunchTapContext | null;
  initialHub?: ContactHubData | null;
  initialPunchAward?: PunchAward | null;
}) {
  const [hub, setHub] = useState<ContactHubData | null>(initialHub);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    initialPunchAward ? punchAwardMessage(initialPunchAward, business.punchGoal) : null,
  );
  const [showCard, setShowCard] = useState(false);
  const [pending, startTransition] = useTransition();
  const phoneRef = useRef<HTMLInputElement>(null);

  function handleIdentify(formData: FormData) {
    startTransition(async () => {
      const result = await identifyContact(business.id, punchTap, formData);
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
        if (result.punchAward) {
          setNotice(punchAwardMessage(result.punchAward, business.punchGoal));
        }
      }
    });
  }

  function handleRedeem() {
    if (!hub) return;
    startTransition(async () => {
      const result = await redeemReward(business.id, hub.contactId);
      if (result.status === "error") {
        setNotice(result.message);
        return;
      }
      setHub({ ...hub, reward: result.reward });
    });
  }

  // An outstanding reward outranks the rest of the hub — it's the only thing
  // the customer is at the counter for. Punch-card customers can still step
  // back to their card, since they keep earning after this one.
  if (hub?.reward && !showCard) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center">
        <RewardCard
          businessName={business.name}
          reward={hub.reward}
          onRedeem={handleRedeem}
          redeeming={pending}
        />
        {notice && <p className="mt-3 text-center text-sm text-muted">{notice}</p>}
        {business.rewardMode === "punch_card" && (
          <button
            type="button"
            onClick={() => setShowCard(true)}
            className="mt-4 text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
          >
            View my punch card
          </button>
        )}
      </div>
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
          {punchTap
            ? "Almost there"
            : business.rewardMode === "none"
              ? "Leave us a review"
              : "Get on the list"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {punchTap
            ? "Your stamp is waiting — tell us who you are so we know whose card to put it on."
            : business.rewardMode === "punch_card"
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
      notice={notice}
      setNotice={setNotice}
      onBackToReward={hub.reward ? () => setShowCard(false) : null}
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
  notice,
  setNotice,
  onBackToReward,
  pending,
  startTransition,
}: {
  business: PublicBusiness;
  tagId: string | null;
  hub: ContactHubData;
  setHub: (h: ContactHubData) => void;
  notice: string | null;
  setNotice: (m: string | null) => void;
  onBackToReward: (() => void) | null;
  pending: boolean;
  startTransition: (fn: () => void | Promise<void>) => void;
}) {
  const activities = availableActivities(business);
  const [pendingCodes, setPendingCodes] = useState<Record<string, string>>({});
  const [claimingId, setClaimingId] = useState<string | null>(null);

  function afterClaim(activity: string, result: Awaited<ReturnType<typeof claimActivity>>) {
    if (result.status === "error") {
      setNotice(result.message);
      return;
    }
    if (result.status === "already_done") {
      setHub({
        ...hub,
        completedActivityIds: [...new Set([...hub.completedActivityIds, activity])],
      });
      return;
    }
    if (result.status === "cooldown") {
      setHub({ ...hub, visitCooldownMinutes: result.minutesRemaining });
      setNotice(
        `You already got a stamp on this visit — come back in about ${result.minutesRemaining} min.`,
      );
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
          activity === VISIT_ACTIVITY
            ? hub.completedActivityIds
            : [...hub.completedActivityIds, activity],
        visitCooldownMinutes:
          activity === VISIT_ACTIVITY ? business.punchCooldownMinutes : hub.visitCooldownMinutes,
      });
      return;
    }
    if (result.status === "reward") {
      setHub({ ...hub, stampCount: 0, reward: result.reward });
    }
  }

  function claim(activityId: string) {
    setClaimingId(activityId);
    setNotice(null);
    startTransition(async () => {
      const result = await claimActivity(business.id, tagId, hub.contactId, activityId);
      afterClaim(activityId, result);
      setClaimingId(null);
    });
  }

  function claimVisit() {
    setClaimingId(VISIT_ACTIVITY);
    setNotice(null);
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
        setHub({ ...hub, reward: result.reward });
      } else if (result.status === "error") {
        setNotice(result.message);
      }
      setClaimingId(null);
    });
  }

  const backLink = onBackToReward && (
    <button
      type="button"
      onClick={onBackToReward}
      className="mt-4 w-full text-center text-sm text-accent hover:opacity-80"
    >
      Back to my reward
    </button>
  );

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
                Show <span className="font-semibold text-foreground">{pendingCode}</span> to staff to
                confirm.
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
        <h1 className="mt-3 text-2xl font-semibold text-balance">
          Thanks, {hub.name?.split(" ")[0] || "friend"}!
        </h1>
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
        {business.rewardDescription && (
          <p className="mt-2 text-sm text-muted">{business.rewardDescription}</p>
        )}
        {activityLinks}
        {notice && <p className="mt-4 text-sm text-danger">{notice}</p>}
        <button
          type="button"
          onClick={claimFlat}
          disabled={pending && claimingId === "flat"}
          className="mt-6 w-full rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending && claimingId === "flat" ? "Claiming…" : "I did this — claim my reward"}
        </button>
        {backLink}
      </div>
    );
  }

  // punch_card
  const onCooldown = hub.visitCooldownMinutes > 0;

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
      <p className="font-mono text-xs uppercase tracking-widest text-accent">{business.name}</p>
      <h1 className="mt-3 text-xl font-semibold text-balance">{business.rewardHeadline}</h1>
      {business.rewardDescription && (
        <p className="mt-1 text-sm text-muted">{business.rewardDescription}</p>
      )}

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
          Show <span className="font-semibold text-foreground">{pendingCodes[VISIT_ACTIVITY]}</span>{" "}
          to staff to confirm.
        </p>
      )}
      {notice && <p className="mt-2 text-center text-sm text-danger">{notice}</p>}
      {onCooldown && !notice && (
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
      {backLink}
    </div>
  );
}
