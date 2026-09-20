import { desc, eq } from "drizzle-orm";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { businesses, redemptions } from "@/db/schema";
import { formatAddressLine } from "@/lib/address";
import { isAdminAuthed } from "@/lib/auth";
import { getTheme } from "@/lib/theme";
import { Logo } from "@/app/components/logo";
import { logoutAdmin } from "./actions";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import type { NavItem } from "./nav-links";
import { NavLinks } from "./nav-links";
import { PaletteTrigger } from "./palette-trigger";
import { ThemeToggle } from "./theme-toggle";

export default async function AdminProtectedLayout({ children }: { children: ReactNode }) {
  if (!(await isAdminAuthed())) redirect("/admin/login");
  const theme = await getTheme();
  const db = getDb();
  const [paletteBusinesses, pendingCount] = await Promise.all([
    db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        addressLine1: businesses.addressLine1,
        addressLine2: businesses.addressLine2,
        city: businesses.city,
        state: businesses.state,
        postalCode: businesses.postalCode,
      })
      .from(businesses)
      .orderBy(desc(businesses.createdAt)),
    db.$count(redemptions, eq(redemptions.status, "pending")),
  ]);

  const NAV: NavItem[] = [
    { href: "/admin", label: "Overview", icon: "overview" },
    { href: "/admin/businesses", label: "Businesses", icon: "businesses" },
    { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/admin/needs-attention", label: "Needs attention", icon: "needs-attention", badge: pendingCount },
    { href: "/admin/tags", label: "Tag inventory", icon: "tags" },
  ];

  return (
    <div data-theme={theme} className="flex min-h-screen flex-1 flex-col bg-background text-foreground md:flex-row">
      <CommandPalette
        businesses={paletteBusinesses.map((b) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          addressLine: formatAddressLine(b),
        }))}
        theme={theme}
      />
      <MobileNav nav={NAV} theme={theme} logoutAction={logoutAdmin} />
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border px-4 py-5 md:flex">
        <Link href="/admin" className="flex items-center gap-2 px-2">
          <Logo markSize={20} className="text-sm" />
        </Link>
        <PaletteTrigger />
        <NavLinks items={NAV} />
        <div className="mt-auto flex flex-col gap-3 px-1">
          <ThemeToggle theme={theme} />
          <form action={logoutAdmin}>
            <button type="submit" className="text-sm text-muted hover:text-foreground">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
