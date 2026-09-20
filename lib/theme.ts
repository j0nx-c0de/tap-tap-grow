"use server";

import { cookies } from "next/headers";

export type Theme = "light" | "dark";

const THEME_COOKIE = "mc_theme";

// Not a security cookie — just a per-browser display preference — so no
// signing needed. Read server-side in the admin layout so the very first
// render already carries the right data-theme attribute; no toggle flash.
export async function getTheme(): Promise<Theme> {
  const store = await cookies();
  return store.get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";
}

export async function setTheme(theme: Theme): Promise<void> {
  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    path: "/admin",
  });
}
