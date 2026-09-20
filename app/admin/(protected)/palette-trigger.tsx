"use client";

// Decoupled from CommandPalette via a DOM event rather than passing an
// onOpen callback through props — this button gets rendered from two
// unrelated places (the desktop sidebar and inside MobileNav's drawer),
// neither of which has a direct reference to the palette instance.
export function PaletteTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("tapview:open-palette"))}
      className={
        className ??
        "flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-foreground"
      }
    >
      <span>Search…</span>
      <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium">Ctrl K</kbd>
    </button>
  );
}
