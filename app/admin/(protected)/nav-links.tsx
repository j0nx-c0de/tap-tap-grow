"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertIcon, ChartIcon, GridIcon, HomeIcon, TagIcon } from "./nav-icons";

const ICONS = {
  overview: HomeIcon,
  businesses: GridIcon,
  dashboard: ChartIcon,
  "needs-attention": AlertIcon,
  tags: TagIcon,
} as const;

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
};

// "/admin" (Overview) has no children, so it only matches itself — without
// this carve-out the general prefix rule below would match it against every
// other admin route, since they're all nested under "/admin/...".
function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = ICONS[item.icon];
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-accent/15 text-accent" : "text-muted hover:bg-card hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </span>
            {!!item.badge && (
              <span className="rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
