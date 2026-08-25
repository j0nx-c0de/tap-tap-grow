"use client";

import { useActionState } from "react";
import { verifyAdminPassword, type AdminLoginState } from "./actions";

const initialState: AdminLoginState = { status: "idle" };

export default function AdminLoginPage() {
  const [state, action, pending] = useActionState(verifyAdminPassword, initialState);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <form
        action={action}
        className="w-full max-w-xs rounded-2xl border border-border bg-card p-8 text-center shadow-sm"
      >
        <p className="font-mono text-xs uppercase tracking-widest text-accent">Tap Loop</p>
        <h1 className="mt-3 text-xl font-semibold">Admin sign-in</h1>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className="mt-6 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent"
        />
        {state.status === "error" && <p className="mt-3 text-sm text-danger">{state.message}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
