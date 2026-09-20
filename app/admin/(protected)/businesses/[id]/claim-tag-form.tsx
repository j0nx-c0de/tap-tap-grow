"use client";

import { useActionState } from "react";
import type { AvailableActivity } from "@/lib/activities";
import type { ClaimTagFormState } from "../../actions";

const initialState: ClaimTagFormState = { status: "idle" };
const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent";

export function ClaimTagForm({
  action,
  activities,
}: {
  action: (prevState: ClaimTagFormState, formData: FormData) => Promise<ClaimTagFormState>;
  activities: AvailableActivity[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Claim a tag <span className="font-normal text-muted">(activation code)</span>
        <input name="activationCode" required className={`${inputClass} font-mono uppercase`} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Point straight at <span className="font-normal text-muted">(optional)</span>
        <select name="directActivity" defaultValue="" className={inputClass}>
          <option value="">Full hub (default)</option>
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-border px-5 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {pending ? "Claiming…" : "Claim tag"}
      </button>
      {state.message && (
        <p className={`w-full text-sm ${state.status === "error" ? "text-danger" : "text-muted"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
