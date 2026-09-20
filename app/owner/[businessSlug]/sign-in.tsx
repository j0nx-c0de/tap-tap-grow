"use client";

import { useActionState } from "react";
import { requestOwnerLogin, verifyOwnerCode, type SignInState } from "./actions";

const initialState: SignInState = { status: "idle" };

const buttonClass =
  "w-full rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60";
const secondaryClass =
  "w-full rounded-full border border-border px-6 py-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

export function SignIn({
  businessSlug,
  businessName,
  maskedEmail,
  maskedPhone,
  expired = false,
}: {
  businessSlug: string;
  businessName: string;
  maskedEmail: string | null;
  maskedPhone: string | null;
  // Arrived here from a magic link that was already used, expired, or wrong.
  expired?: boolean;
}) {
  const [state, request, requesting] = useActionState(
    requestOwnerLogin.bind(null, businessSlug),
    initialState,
  );
  const [verifyState, verify, verifying] = useActionState(
    verifyOwnerCode.bind(null, businessSlug),
    initialState,
  );

  // Once a code is on its way, the code entry is the only thing that matters;
  // the channel buttons stay below it in case they want to start over.
  const awaitingCode = state.status === "sent" && state.channel === "sms";
  const expiredNotice =
    expired && state.status === "idle" && verifyState.status === "idle"
      ? "That link has already been used or expired — here's a fresh start."
      : null;
  const notice = verifyState.message ?? state.message ?? expiredNotice;
  const isError =
    state.status === "error" || verifyState.status === "error" || !!verifyState.message || !!expiredNotice;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">{businessName}</p>
        <h1 className="mt-3 text-2xl font-semibold text-balance">Your results</h1>

        {!maskedEmail && !maskedPhone ? (
          <p className="mt-3 text-sm text-muted">
            There&apos;s no email or phone number on file for this business yet, so there&apos;s
            nowhere to send a sign-in link. Ask your Tap Tap Grow contact to add one.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              No password — we&apos;ll send you a one-time sign-in
              {maskedEmail && maskedPhone ? " link or code" : maskedEmail ? " link" : " code"}.
            </p>

            {awaitingCode && (
              <form action={verify} className="mt-6">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Enter the code
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    autoFocus
                    className="rounded-lg border border-border bg-background px-3 py-3 text-center text-2xl tracking-[0.4em] outline-none focus:border-accent"
                  />
                </label>
                <button type="submit" disabled={verifying} className={`${buttonClass} mt-4`}>
                  {verifying ? "Checking…" : "Sign in"}
                </button>
              </form>
            )}

            {notice && (
              <p className={`mt-4 text-sm ${isError ? "text-danger" : "text-muted"}`}>{notice}</p>
            )}

            <form action={request} className="mt-6 flex flex-col gap-3">
              {maskedEmail && (
                <button
                  type="submit"
                  name="channel"
                  value="email"
                  disabled={requesting}
                  className={awaitingCode ? secondaryClass : buttonClass}
                >
                  {requesting ? "Sending…" : `Email a link to ${maskedEmail}`}
                </button>
              )}
              {maskedPhone && (
                <button
                  type="submit"
                  name="channel"
                  value="sms"
                  disabled={requesting}
                  className={maskedEmail || awaitingCode ? secondaryClass : buttonClass}
                >
                  {requesting ? "Sending…" : awaitingCode ? "Send a new code" : `Text a code to ${maskedPhone}`}
                </button>
              )}
            </form>
          </>
        )}
      </div>
    </main>
  );
}
