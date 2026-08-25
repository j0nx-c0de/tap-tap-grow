"use client";

import { useFormStatus } from "react-dom";
import { activityLabel } from "@/lib/activities";
import { approveRedemption } from "./actions";

type Row = {
  redemption: {
    id: string;
    kind: "reward" | "stamp";
    activity: string | null;
    code: string;
    status: "pending" | "approved";
    rewardSnapshot: string;
  };
  contact: { name: string | null; phone: string } | null;
};

function kindLabel(redemption: Row["redemption"]): string {
  if (redemption.kind === "reward") return "Reward";
  return activityLabel(redemption.activity) || "Stamp";
}

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Approving…" : "Approve"}
    </button>
  );
}

export function RedemptionConsole({
  businessSlug,
  businessName,
  rows,
}: {
  businessSlug: string;
  businessName: string;
  rows: Row[];
}) {
  const pending = rows.filter((r) => r.redemption.status === "pending");
  const approved = rows.filter((r) => r.redemption.status === "approved").slice(0, 10);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-10">
      <p className="font-mono text-xs uppercase tracking-widest text-accent">{businessName}</p>
      <h1 className="mt-2 text-2xl font-semibold">Redemptions</h1>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-muted">Pending ({pending.length})</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {pending.length === 0 && <li className="text-sm text-muted">Nothing waiting.</li>}
          {pending.map(({ redemption, contact }) => (
            <li
              key={redemption.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div>
                <p className="font-mono text-lg font-semibold tracking-widest">{redemption.code}</p>
                <p className="text-sm">{redemption.rewardSnapshot}</p>
                <p className="text-xs text-muted">
                  {kindLabel(redemption)} ·{" "}
                  {contact?.name || contact?.phone || "—"}
                </p>
              </div>
              <form action={approveRedemption}>
                <input type="hidden" name="businessSlug" value={businessSlug} />
                <input type="hidden" name="redemptionId" value={redemption.id} />
                <ApproveButton />
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted">Recently approved</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {approved.length === 0 && <li className="text-sm text-muted">None yet.</li>}
          {approved.map(({ redemption, contact }) => (
            <li key={redemption.id} className="rounded-xl border border-border p-4 opacity-70">
              <p className="font-mono text-sm tracking-widest">{redemption.code}</p>
              <p className="text-sm">{redemption.rewardSnapshot}</p>
              <p className="text-xs text-muted">
                {kindLabel(redemption)} · {contact?.name || contact?.phone || "—"}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
