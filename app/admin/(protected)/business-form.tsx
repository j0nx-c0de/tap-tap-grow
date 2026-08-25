"use client";

import type { ReactNode } from "react";
import { useActionState, useState } from "react";
import type { BusinessFormState } from "./actions";

type RewardMode = "none" | "flat" | "punch_card";

type Initial = {
  name?: string;
  slug?: string;
  googleReviewUrl?: string | null;
  yelpReviewUrl?: string | null;
  facebookReviewUrl?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  redemptionMode?: "honor" | "staff_verified";
  rewardMode?: RewardMode;
  rewardHeadline?: string;
  rewardDescription?: string | null;
  punchGoal?: number;
  punchCooldownMinutes?: number;
  staffPin?: string;
  smsEnabled?: boolean;
  smsFromNumber?: string | null;
};

const initialState: BusinessFormState = { status: "idle" };
const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      <span>
        {label} {hint && <span className="font-normal text-muted">({hint})</span>}
      </span>
      {children}
    </label>
  );
}

export function BusinessForm({
  action,
  initial,
  submitLabel,
}: {
  action: (prevState: BusinessFormState, formData: FormData) => Promise<BusinessFormState>;
  initial?: Initial;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [rewardMode, setRewardMode] = useState<RewardMode>(initial?.rewardMode ?? "punch_card");

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <Field label="Business name">
        <input name="name" defaultValue={initial?.name} required className={inputClass} />
      </Field>
      <Field label="Slug" hint="used in the staff console URL: /staff/your-slug">
        <input
          name="slug"
          defaultValue={initial?.slug}
          required
          pattern="[a-z0-9-]+"
          className={inputClass}
        />
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-medium text-muted">Review &amp; follow links</legend>
        <p className="-mt-1 text-xs text-muted">
          Only the links you fill in get offered to customers — leave the rest blank.
        </p>
        <Field label="Google review">
          <input
            name="googleReviewUrl"
            defaultValue={initial?.googleReviewUrl ?? ""}
            placeholder="https://..."
            className={inputClass}
          />
        </Field>
        <Field label="Yelp review">
          <input
            name="yelpReviewUrl"
            defaultValue={initial?.yelpReviewUrl ?? ""}
            placeholder="https://..."
            className={inputClass}
          />
        </Field>
        <Field label="Facebook review">
          <input
            name="facebookReviewUrl"
            defaultValue={initial?.facebookReviewUrl ?? ""}
            placeholder="https://..."
            className={inputClass}
          />
        </Field>
        <Field label="Instagram follow">
          <input
            name="instagramUrl"
            defaultValue={initial?.instagramUrl ?? ""}
            placeholder="https://..."
            className={inputClass}
          />
        </Field>
        <Field label="TikTok follow">
          <input
            name="tiktokUrl"
            defaultValue={initial?.tiktokUrl ?? ""}
            placeholder="https://..."
            className={inputClass}
          />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-medium text-muted">Reward</legend>
        <Field label="Reward mode">
          <select
            name="rewardMode"
            value={rewardMode}
            onChange={(e) => setRewardMode(e.target.value as RewardMode)}
            className={inputClass}
          >
            <option value="none">None — just ask for reviews/follows</option>
            <option value="flat">Flat — one reward, claimed once</option>
            <option value="punch_card">Punch card — repeatable stamps</option>
          </select>
        </Field>

        {rewardMode !== "none" && (
          <>
            <Field label={rewardMode === "punch_card" ? "Reward at goal" : "Reward headline"}>
              <input
                name="rewardHeadline"
                defaultValue={initial?.rewardHeadline ?? "10% off your next visit"}
                required
                className={inputClass}
              />
            </Field>
            <Field label="Fine print" hint="optional">
              <input
                name="rewardDescription"
                defaultValue={initial?.rewardDescription ?? ""}
                className={inputClass}
              />
            </Field>
          </>
        )}

        {rewardMode !== "none" && (
          <Field label="How redemption is verified">
            <select
              name="redemptionMode"
              defaultValue={initial?.redemptionMode ?? "staff_verified"}
              className={inputClass}
            >
              <option value="staff_verified">Staff approves at the register</option>
              <option value="honor">Honor system — self-report</option>
            </select>
          </Field>
        )}
        {/* Kept outside the branch above so the field still submits even
            when rewardMode is "none" — the column has no default we can
            rely on client-side, and switching back later shouldn't reset it. */}
        {rewardMode === "none" && (
          <input type="hidden" name="redemptionMode" value={initial?.redemptionMode ?? "staff_verified"} />
        )}

        <Field label="Staff PIN" hint="4-6 digits, unlocks the redemption console">
          <input
            name="staffPin"
            defaultValue={initial?.staffPin ?? "1234"}
            required
            pattern="\d{4,6}"
            className={inputClass}
          />
        </Field>
      </fieldset>

      {rewardMode === "punch_card" && (
        <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <legend className="px-1 text-sm font-medium text-muted">Punch card</legend>
          <Field label="Stamps needed">
            <input
              name="punchGoal"
              type="number"
              min={1}
              max={50}
              defaultValue={initial?.punchGoal ?? 10}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Visit cooldown" hint="minutes between repeat-visit stamps for the same person">
            <input
              name="punchCooldownMinutes"
              type="number"
              min={1}
              max={1440}
              defaultValue={initial?.punchCooldownMinutes ?? 60}
              required
              className={inputClass}
            />
          </Field>
        </fieldset>
      )}
      {rewardMode !== "punch_card" && (
        <>
          <input type="hidden" name="punchGoal" value={initial?.punchGoal ?? 10} />
          <input type="hidden" name="punchCooldownMinutes" value={initial?.punchCooldownMinutes ?? 60} />
        </>
      )}

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-medium text-muted">Texting</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="smsEnabled" defaultChecked={initial?.smsEnabled ?? true} />
          Send the automatic welcome text on sign-up
        </label>
        <Field label="Twilio number for this business" hint="optional — falls back to the platform default">
          <input
            name="smsFromNumber"
            defaultValue={initial?.smsFromNumber ?? ""}
            placeholder="+15551234567"
            className={inputClass}
          />
        </Field>
      </fieldset>

      {state.status === "error" && <p className="text-sm text-danger">{state.message}</p>}
      {state.status === "idle" && state.message && <p className="text-sm text-accent">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
