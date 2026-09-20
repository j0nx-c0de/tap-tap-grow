"use client";

import type { ReactNode } from "react";
import { useActionState, useState } from "react";
import type { BusinessFormState } from "./actions";

type RewardMode = "none" | "flat" | "punch_card";

type Initial = {
  name?: string;
  slug?: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
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
        <legend className="px-1 text-sm font-medium text-muted">Business contact</legend>
        <p className="-mt-1 text-xs text-muted">
          Who you actually call about this account — not a customer.
        </p>
        <Field label="Owner/manager name">
          <input name="ownerName" defaultValue={initial?.ownerName ?? ""} required className={inputClass} />
        </Field>
        <Field label="Phone number">
          <input
            name="ownerPhone"
            type="tel"
            defaultValue={initial?.ownerPhone ?? ""}
            placeholder="(555) 123-4567"
            required
            className={inputClass}
          />
        </Field>
        <Field label="Contact email" hint="optional">
          <input
            name="ownerEmail"
            type="email"
            defaultValue={initial?.ownerEmail ?? ""}
            className={inputClass}
          />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-medium text-muted">Address</legend>
        <p className="-mt-1 text-xs text-muted">
          This location&apos;s street address — what tells two branches of the same chain, or a
          competitor with a near-identical name, apart in your list.
        </p>
        <Field label="Street address">
          <input
            name="addressLine1"
            defaultValue={initial?.addressLine1 ?? ""}
            placeholder="1200 W Main St"
            autoComplete="address-line1"
            required
            className={inputClass}
          />
        </Field>
        <Field label="Suite / unit" hint="optional">
          <input
            name="addressLine2"
            defaultValue={initial?.addressLine2 ?? ""}
            placeholder="Suite 4"
            autoComplete="address-line2"
            className={inputClass}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="City">
            <input
              name="city"
              defaultValue={initial?.city ?? ""}
              autoComplete="address-level2"
              required
              className={inputClass}
            />
          </Field>
          <Field label="State">
            <input
              name="state"
              defaultValue={initial?.state ?? ""}
              placeholder="IL"
              autoComplete="address-level1"
              maxLength={2}
              pattern="[A-Za-z]{2}"
              required
              className={`${inputClass} uppercase`}
            />
          </Field>
          <Field label="ZIP">
            <input
              name="postalCode"
              defaultValue={initial?.postalCode ?? ""}
              placeholder="62704"
              autoComplete="postal-code"
              inputMode="numeric"
              pattern="\d{5}(-\d{4})?"
              required
              className={inputClass}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-medium text-muted">Review &amp; follow links</legend>
        <p className="-mt-1 text-xs text-muted">
          Only the links you fill in get offered to customers — leave the rest blank.
        </p>
        <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted">
          <span className="font-medium text-foreground">Reviews never earn a stamp.</span> Google
          bans rewarding reviews — loyalty points included, and whether the review is positive or
          not — and the penalty lands on the business, not on us. Review links are shown and
          tracked, but only follows and visits are claimable. Yelp goes further and forbids asking
          at all, so its link reads &ldquo;Find us on Yelp&rdquo; and sits apart from the ask.
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
