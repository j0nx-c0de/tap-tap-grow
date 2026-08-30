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

// Recover the signed payload itself, rather than checking it against a value
// we already know. Used by the contact session, where the contact id is what
// we're trying to read out of the cookie.
function readSigned(signed: string | undefined): string | null {
  if (!signed) return null;
  const dot = signed.lastIndexOf(".");
  if (dot === -1) return null;
  const value = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);

  const expectedSig = createHmac("sha256", secret()).update(value).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return value;
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

// A punch tag tap lands on /p/[key] with no idea who is holding the phone, so
// unlike the per-visit phone entry on the hub, identity has to survive between
// taps in the browser itself. This is a convenience credential for a loyalty
// card, not a login: worst case someone else's phone earns a stamp, and every
// reward it leads to is still gated behind redemption.
const CONTACT_MAX_AGE = 60 * 60 * 24 * 365;

function contactCookieName(businessId: string): string {
  return `mc_contact_${businessId}`;
}

export async function getContactSession(businessId: string): Promise<string | null> {
  const store = await cookies();
  return readSigned(store.get(contactCookieName(businessId))?.value);
}

export async function setContactSession(businessId: string, contactId: string): Promise<void> {
  const store = await cookies();
  store.set(contactCookieName(businessId), sign(contactId), {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: CONTACT_MAX_AGE,
    path: "/",
  });
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
