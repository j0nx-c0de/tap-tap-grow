import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set. Copy .env.example to .env.local and fill it in.");
  return s;
}

function sign(value: string): string {
  const sig = createHmac("sha256", secret()).update(value).digest("hex");
  return `${value}.${sig}`;
}

function verify(signed: string | undefined, expectedValue: string): boolean {
  if (!signed) return false;
  const dot = signed.lastIndexOf(".");
  if (dot === -1) return false;
  const value = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  if (value !== expectedValue) return false;

  const expectedSig = createHmac("sha256", secret()).update(value).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  return a.length === b.length && timingSafeEqual(a, b);
}

const isProd = process.env.NODE_ENV === "production";
const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours — a shift

const ADMIN_COOKIE = "mc_admin";

export async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies();
  return verify(store.get(ADMIN_COOKIE)?.value, "admin");
}

export async function setAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, sign("admin"), {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/admin",
  });
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete({ name: ADMIN_COOKIE, path: "/admin" });
}

function staffCookieName(businessSlug: string): string {
  return `mc_staff_${businessSlug}`;
}

export async function isStaffAuthed(businessSlug: string): Promise<boolean> {
  const store = await cookies();
  return verify(store.get(staffCookieName(businessSlug))?.value, businessSlug);
}

export async function setStaffSession(businessSlug: string): Promise<void> {
  const store = await cookies();
  store.set(staffCookieName(businessSlug), sign(businessSlug), {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: `/staff/${businessSlug}`,
  });
}
