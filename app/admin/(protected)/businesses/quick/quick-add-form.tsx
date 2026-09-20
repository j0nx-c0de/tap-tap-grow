"use client";

import { useActionState } from "react";
import type { QuickAddFormState } from "../../actions";

const initialState: QuickAddFormState = { status: "idle" };
const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent";

export function QuickAddForm({
  action,
}: {
  action: (prevState: QuickAddFormState, formData: FormData) => Promise<QuickAddFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>Business name</span>
        <input name="name" required placeholder="Joe's Pizza" className={inputClass} />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>
          Google review link <span className="font-normal text-muted">(where a tap lands)</span>
        </span>
        {/* Autocorrect and capitalisation are off on every pasted-URL field
            here: a phone keyboard will happily capitalise the first letter of
            a pasted link, and the destination is typed once and then written
            onto physical hardware. */}
        <input
          name="googleReviewUrl"
          type="url"
          inputMode="url"
          required
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://g.page/r/.../review"
          className={`${inputClass} font-mono text-sm`}
        />
        <span className="text-xs font-normal text-muted">
          In the owner&apos;s Google Business Profile: <strong>Ask for reviews</strong> → copy
          link. A Maps link works too, but it opens the listing instead of the review box — you
          get a warning on the next screen if that&apos;s what this turns out to be.
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>
          Tag activation code <span className="font-normal text-muted">(optional)</span>
        </span>
        <input
          name="activationCode"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Blank mints a new tap link"
          className={`${inputClass} font-mono uppercase`}
        />
        <span className="text-xs font-normal text-muted">
          The code printed beside a blank tag in Tag inventory — use it if you already have the
          physical tag in your hand. Leaving it blank still gives you a tap link to write to any
          tag afterwards.
        </span>
      </label>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Create and show the tap link"}
        </button>
        {state.message && (
          <p
            className={`mt-3 text-sm ${state.status === "error" ? "text-danger" : "text-muted"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
