"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Debounced so typing doesn't fire a server round trip per keystroke.
// router.replace (not push) keeps every keystroke out of browser history —
// back should leave the list, not step through partial queries.
export function SearchBox({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(defaultValue);
  const [lastDefaultValue, setLastDefaultValue] = useState(defaultValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  if (defaultValue !== lastDefaultValue) {
    setLastDefaultValue(defaultValue);
    setValue(defaultValue);
  }

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  function onChange(next: string) {
    setValue(next);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const trimmed = next.trim();
      router.replace(trimmed ? `${pathname}?q=${encodeURIComponent(trimmed)}` : pathname, { scroll: false });
    }, 250);
  }

  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search by name, street, city, or ZIP…"
      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
    />
  );
}
