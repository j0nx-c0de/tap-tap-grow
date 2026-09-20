"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { setTheme, type Theme } from "@/lib/theme";
import { logoutAdmin } from "./actions";

export type PaletteBusiness = { id: string; name: string; slug: string; addressLine: string };

type PaletteItem =
  | { kind: "nav"; id: string; label: string; href: string }
  | { kind: "business"; id: string; label: string; sublabel: string; href: string }
  | { kind: "action"; id: string; label: string; run: () => void };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Ranked substring matching rather than a fuzzy-search dependency: exact
// match, then prefix, then word-start, then "appears anywhere" (including
// the business's address and slug via `keywords`) — good enough at the sizes this
// runs against, and consistent with the rest of the codebase's no-extra-
// dependency, hand-rolled approach (see charts.tsx, kpi-tile.tsx).
function matchScore(label: string, keywords: string, query: string): number {
  const l = label.toLowerCase();
  const hay = `${l} ${keywords.toLowerCase()}`;
  if (l === query) return 0;
  if (l.startsWith(query)) return 1;
  if (new RegExp(`\\b${escapeRegExp(query)}`).test(l)) return 2;
  if (hay.includes(query)) return 3;
  return -1;
}

export function CommandPalette({ businesses, theme }: { businesses: PaletteBusiness[]; theme: Theme }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState(query);
  const [activeIndex, setActiveIndex] = useState(0);

  if (query !== lastQuery) {
    setLastQuery(query);
    setActiveIndex(0);
  }
  const router = useRouter();
  const [, startTransition] = useTransition();

  const items = useMemo<PaletteItem[]>(() => {
    const nav: PaletteItem[] = [
      { kind: "nav", id: "nav-overview", label: "Overview", href: "/admin" },
      { kind: "nav", id: "nav-businesses", label: "Businesses", href: "/admin/businesses" },
      { kind: "nav", id: "nav-dashboard", label: "Dashboard", href: "/admin/dashboard" },
      { kind: "nav", id: "nav-needs-attention", label: "Needs attention", href: "/admin/needs-attention" },
      { kind: "nav", id: "nav-tags", label: "Tag inventory", href: "/admin/tags" },
      { kind: "nav", id: "nav-new", label: "New business", href: "/admin/businesses/new" },
    ];
    const actions: PaletteItem[] = [
      {
        kind: "action",
        id: "action-theme",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        run: () =>
          startTransition(async () => {
            await setTheme(theme === "dark" ? "light" : "dark");
            router.refresh();
          }),
      },
      {
        kind: "action",
        id: "action-logout",
        label: "Log out",
        run: () => startTransition(async () => await logoutAdmin()),
      },
    ];
    // Address first in the sublabel: with two similarly-named businesses on
    // screen, the street tells them apart and the slug doesn't.
    const bizItems: PaletteItem[] = businesses.map((b) => ({
      kind: "business",
      id: `biz-${b.id}`,
      label: b.name,
      sublabel: b.addressLine ? `${b.addressLine} · /staff/${b.slug}` : `/staff/${b.slug}`,
      href: `/admin/businesses/${b.id}`,
    }));
    return [...nav, ...actions, ...bizItems];
  }, [businesses, theme, router]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Empty query: fixed shortcuts, then a handful of recent businesses —
      // not the full list, which would bury the shortcuts on day one and
      // only gets worse as the business count grows.
      const fixed = items.filter((i) => i.kind !== "business");
      const recentBiz = items.filter((i) => i.kind === "business").slice(0, 8);
      return [...fixed, ...recentBiz];
    }
    return items
      .map((item) => ({
        item,
        score: matchScore(item.label, item.kind === "business" ? item.sublabel : "", q),
      }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.item);
  }, [items, query]);

  function openPalette() {
    setQuery("");
    setActiveIndex(0);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  useEffect(() => {
    function onKeydown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
    }
    document.addEventListener("keydown", onKeydown);
    window.addEventListener("tapview:open-palette", openPalette);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      window.removeEventListener("tapview:open-palette", openPalette);
    };
  }, []);

  function runItem(item: PaletteItem) {
    dialogRef.current?.close();
    if (item.kind === "action") item.run();
    else router.push(item.href);
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) runItem(item);
    }
  }

  const activeItem = results[activeIndex];

  return (
    <dialog
      ref={dialogRef}
      onClose={() => setQuery("")}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="command-palette fixed top-[15%] left-1/2 m-0 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl border border-border bg-card p-0 text-foreground"
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onInputKeyDown}
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-listbox"
        aria-activedescendant={activeItem ? `palette-option-${activeItem.id}` : undefined}
        placeholder="Jump to a business, page, or action…"
        className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none"
      />
      <ul id="palette-listbox" role="listbox" className="max-h-80 overflow-y-auto p-2">
        {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches.</li>}
        {results.map((item, i) => (
          <li
            key={item.id}
            id={`palette-option-${item.id}`}
            role="option"
            aria-selected={i === activeIndex}
            onMouseEnter={() => setActiveIndex(i)}
            onClick={() => runItem(item)}
            className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm ${
              i === activeIndex ? "bg-accent/15" : ""
            }`}
          >
            <span className="flex flex-col">
              <span className="font-medium text-foreground">{item.label}</span>
              {"sublabel" in item && <span className="text-xs text-muted">{item.sublabel}</span>}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted">
              {item.kind === "business" ? "Business" : item.kind === "nav" ? "Page" : "Action"}
            </span>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
