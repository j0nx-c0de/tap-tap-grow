import type { ReactNode } from "react";

export function ClaimResult({
  businessName,
  code,
  approved,
  headline,
  description,
  extra,
}: {
  businessName: string;
  code: string;
  approved: boolean;
  headline: string;
  description?: string | null;
  extra?: ReactNode;
}) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <p className="font-mono text-xs uppercase tracking-widest text-accent">{businessName}</p>
      <p className="mt-3 text-lg font-medium text-balance">{headline}</p>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      {extra}
      <p className="mt-6 rounded-xl border border-dashed border-border bg-background py-4 font-mono text-4xl font-semibold tracking-[0.3em] text-foreground">
        {code}
      </p>
      {approved ? (
        <p className="mt-4 text-sm text-muted">Show this screen to staff to redeem.</p>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Show this code to staff — they&apos;ll approve it at the register.
        </p>
      )}
    </div>
  );
}
