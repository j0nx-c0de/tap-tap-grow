"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/app/components/logo";
import type { Theme } from "@/lib/theme";
import type { NavItem } from "./nav-links";
import { NavLinks } from "./nav-links";
import { PaletteTrigger } from "./palette-trigger";
import { ThemeToggle } from "./theme-toggle";

// The sidebar in layout.tsx is `hidden md:flex` — this renders the mobile
// equivalent (a top bar + slide-over drawer) so the admin is usable below
// that breakpoint. Same nav items and actions, just a different shell,
// since checking a business's stats from a phone at their counter is a real
// workflow here, not a hypothetical.
export function MobileNav({
  nav,
  theme,
  logoutAction,
}: {
  nav: NavItem[];
  theme: Theme;
  logoutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <header className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
        <Link href="/admin" className="flex items-center gap-2">
          <Logo markSize={18} className="text-sm" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="rounded-lg p-2 text-foreground hover:bg-card"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M2.5 5h15M2.5 10h15M2.5 15h15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-foreground/20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col overflow-y-auto border-r border-border bg-background px-4 py-5">
            <div className="flex items-center justify-between px-2">
              <Logo markSize={18} className="text-sm" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-muted hover:bg-card hover:text-foreground"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="mt-4" onClick={() => setOpen(false)}>
              <PaletteTrigger />
            </div>
            <div className="mt-4">
              <NavLinks items={nav} />
            </div>
            <div className="mt-auto flex flex-col gap-3 px-1">
              <ThemeToggle theme={theme} />
              <form action={logoutAction}>
                <button type="submit" className="text-sm text-muted hover:text-foreground">
                  Log out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
