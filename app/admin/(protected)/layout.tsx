import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/auth";
import { logoutAdmin } from "./actions";

export default async function AdminProtectedLayout({ children }: { children: ReactNode }) {
  if (!(await isAdminAuthed())) redirect("/admin/login");

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/admin" className="font-mono text-xs uppercase tracking-widest text-accent">
          Tap Loop — Admin
        </Link>
        <form action={logoutAdmin}>
          <button type="submit" className="text-sm text-muted hover:text-foreground">
            Log out
          </button>
        </form>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
