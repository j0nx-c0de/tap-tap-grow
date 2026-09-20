"use server";

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { businesses, punchTags, tags } from "@/db/schema";
import { availableActivities, GOOGLE_REVIEW } from "@/lib/activities";
import { clearAdminSession, isAdminAuthed } from "@/lib/auth";
import { toPublicBusiness } from "@/lib/business";
import { generatePunchTagKey, generateTagActivationCode } from "@/lib/codes";
import { sendEmail } from "@/lib/email";
import { isHttpUrl } from "@/lib/google-review";
import { isPlausiblePhone, normalizePhone } from "@/lib/phone";
import { uniqueBusinessSlug } from "@/lib/slug";
import { sendSms } from "@/lib/sms";
import { appUrl } from "@/lib/url";

const urlOrEmpty = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^https?:\/\/.+/i.test(v), "Must be a full https:// link");

const businessSchema = {
  name: z.string().trim().min(1, "Name is required"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  // The business's owner/manager — who you actually call about this account,
  // not a customer. Name and phone are required so every business has
  // someone reachable; email is a bonus, not everyone checks it.
  ownerName: z.string().trim().min(1, "Owner/manager name is required"),
  ownerEmail: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address"),
  ownerPhone: z
    .string()
    .trim()
    .min(1, "Owner/manager phone is required")
    .refine((v) => isPlausiblePhone(normalizePhone(v)), "That phone number doesn't look right"),
  // Where this location physically is. Required (except the suite line)
  // because it's the only thing that separates two businesses with the same
  // or near-identical name, and it's free to ask for while standing in the
  // door. State is normalized to a two-letter code so "il", "IL" and "Il"
  // can't produce three spellings of the same place in the list.
  addressLine1: z.string().trim().min(1, "Street address is required"),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().min(1, "City is required"),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use the two-letter state code, e.g. IL"),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP, e.g. 62704"),
  googleReviewUrl: urlOrEmpty,
  yelpReviewUrl: urlOrEmpty,
  facebookReviewUrl: urlOrEmpty,
  instagramUrl: urlOrEmpty,
  tiktokUrl: urlOrEmpty,
  redemptionMode: z.enum(["honor", "staff_verified"]),
  rewardMode: z.enum(["none", "flat", "punch_card"]),
  rewardHeadline: z.string().trim().min(1, "Reward headline is required"),
  rewardDescription: z.string().trim().optional(),
  punchGoal: z.coerce.number().int().min(1).max(50),
  punchCooldownMinutes: z.coerce.number().int().min(1).max(1440),
  staffPin: z.string().trim().regex(/^\d{4,6}$/, "4-6 digits"),
  smsEnabled: z.literal("on").optional(),
  smsFromNumber: z.string().trim().optional(),
} as const;

const businessInput = z.object(businessSchema);

export type BusinessFormState = {
  status: "idle" | "error";
  message?: string;
};

async function requireAdmin() {
  if (!(await isAdminAuthed())) throw new Error("Not authorized");
}

// Hands the owner their own dashboard link at sign-up, so it's sitting in
// their phone rather than depending on you to pass it along later. Sending
// is best-effort on purpose: the business row is already committed by this
// point, and neither Twilio nor Resend failing should turn a successful
// creation into an error page.
async function sendOwnerWelcome(business: typeof businesses.$inferSelect): Promise<void> {
  const url = appUrl(`/owner/${business.slug}`);
  const line = `You're set up on Tap Tap Grow! See ${business.name}'s results anytime at ${url} — no password, we'll text or email you a code.`;

  try {
    if (business.ownerPhone) await sendSms(business.ownerPhone, line, business.smsFromNumber);
  } catch (err) {
    console.error("[owner-welcome:sms]", err);
  }

  try {
    if (business.ownerEmail) {
      await sendEmail(
        business.ownerEmail,
        `Your ${business.name} dashboard`,
        `<p>You're set up on Tap Tap Grow.</p>
         <p>See ${business.name}'s results anytime at <a href="${url}">${url}</a> — there's no
         password to remember; we'll email or text you a one-time code when you need to sign in.</p>`,
      );
    }
  } catch (err) {
    console.error("[owner-welcome:email]", err);
  }
}

export async function createBusiness(
  _prev: BusinessFormState,
  formData: FormData,
): Promise<BusinessFormState> {
  await requireAdmin();
  const parsed = businessInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const data = parsed.data;
  const db = getDb();

  let business;
  try {
    [business] = await db
      .insert(businesses)
      .values({
        name: data.name,
        slug: data.slug,
        ownerName: data.ownerName,
        ownerEmail: data.ownerEmail || null,
        ownerPhone: normalizePhone(data.ownerPhone),
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 || null,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        googleReviewUrl: data.googleReviewUrl || null,
        yelpReviewUrl: data.yelpReviewUrl || null,
        facebookReviewUrl: data.facebookReviewUrl || null,
        instagramUrl: data.instagramUrl || null,
        tiktokUrl: data.tiktokUrl || null,
        redemptionMode: data.redemptionMode,
        rewardMode: data.rewardMode,
        rewardHeadline: data.rewardHeadline,
        rewardDescription: data.rewardDescription || null,
        punchGoal: data.punchGoal,
        punchCooldownMinutes: data.punchCooldownMinutes,
        staffPin: data.staffPin,
        smsEnabled: data.smsEnabled === "on",
        smsFromNumber: data.smsFromNumber || null,
      })
      .returning();
  } catch {
    return { status: "error", message: "That slug is already taken." };
  }

  await db.insert(tags).values([
    {
      businessId: business.id,
      type: "hub",
      label: "Front counter",
      claimedAt: new Date(),
      activationCode: generateTagActivationCode(),
    },
  ]);

  await sendOwnerWelcome(business);

  redirect(`/admin/businesses/${business.id}`);
}

export type QuickAddFormState = { status: "idle" | "error"; message?: string };

// The doorstep path: a business name, their Google review link, and
// optionally the activation code of a tag already in your hand. Everything
// the full form asks for beyond that — owner contact, address, reward
// config, staff PIN — is left null or on its schema default.
//
// Deliberately a second action rather than loosened optionality on
// `createBusiness`: those fields are required because a business running a
// punch card genuinely needs them, and relaxing that one schema to serve
// this path would quietly let the full form save half a business too.
const quickAddSchema = z.object({
  name: z.string().trim().min(1, "Business name is required"),
  googleReviewUrl: z
    .string()
    .trim()
    .min(1, "Paste the business's Google review link")
    .refine(isHttpUrl, "Must be a full https:// link"),
  // Blank means "no physical tag in hand yet" — a fresh one gets minted
  // below instead. An empty text input arrives as "", never undefined.
  activationCode: z
    .string()
    .optional()
    .transform((v) => (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")),
});

export async function createReviewOnlyBusiness(
  _prev: QuickAddFormState,
  formData: FormData,
): Promise<QuickAddFormState> {
  await requireAdmin();
  const parsed = quickAddSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const data = parsed.data;
  const db = getDb();

  // Resolved before the business row is written, so a mistyped code leaves
  // nothing behind to clean up and the form can be corrected and resubmitted
  // as-is.
  let claimTarget: { id: string } | undefined;
  if (data.activationCode) {
    [claimTarget] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.activationCode, data.activationCode))
      .limit(1);
    if (!claimTarget) return { status: "error", message: "No tag has that activation code." };
  }

  // Derived rather than asked for. The slug only shows up in operator-facing
  // and owner-facing URLs, never on the tag, so it is not worth a field on a
  // form being filled in while someone watches.
  const slug = await uniqueBusinessSlug(db, data.name);

  let business;
  try {
    [business] = await db
      .insert(businesses)
      .values({
        name: data.name,
        slug,
        googleReviewUrl: data.googleReviewUrl,
        // Nothing to claim, so nothing to configure: nobody reaches a reward
        // screen, and the punch/staff columns keep their defaults untouched.
        rewardMode: "none",
      })
      .returning();
  } catch {
    return { status: "error", message: `Couldn't save — the slug "${slug}" is already taken.` };
  }

  // The tag points straight at Google. Without `directActivity` a tap lands
  // on the hub, which is the half of the product this path exists to skip.
  if (claimTarget) {
    await db
      .update(tags)
      .set({ businessId: business.id, claimedAt: new Date(), directActivity: GOOGLE_REVIEW })
      .where(eq(tags.id, claimTarget.id));
  } else {
    await db.insert(tags).values({
      businessId: business.id,
      type: "hub",
      label: "Front counter",
      claimedAt: new Date(),
      activationCode: generateTagActivationCode(),
      directActivity: GOOGLE_REVIEW,
    });
  }

  // No owner welcome, unlike `createBusiness`: this path collects no owner
  // phone or email, and there is no reward dashboard to send them to yet.
  redirect(`/admin/businesses/${business.id}`);
}

export async function updateBusiness(
  businessId: string,
  _prev: BusinessFormState,
  formData: FormData,
): Promise<BusinessFormState> {
  await requireAdmin();
  const parsed = businessInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const data = parsed.data;
  const db = getDb();

  try {
    await db
      .update(businesses)
      .set({
        name: data.name,
        slug: data.slug,
        ownerName: data.ownerName,
        ownerEmail: data.ownerEmail || null,
        ownerPhone: normalizePhone(data.ownerPhone),
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 || null,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        googleReviewUrl: data.googleReviewUrl || null,
        yelpReviewUrl: data.yelpReviewUrl || null,
        facebookReviewUrl: data.facebookReviewUrl || null,
        instagramUrl: data.instagramUrl || null,
        tiktokUrl: data.tiktokUrl || null,
        redemptionMode: data.redemptionMode,
        rewardMode: data.rewardMode,
        rewardHeadline: data.rewardHeadline,
        rewardDescription: data.rewardDescription || null,
        punchGoal: data.punchGoal,
        punchCooldownMinutes: data.punchCooldownMinutes,
        staffPin: data.staffPin,
        smsEnabled: data.smsEnabled === "on",
        smsFromNumber: data.smsFromNumber || null,
      })
      .where(eq(businesses.id, businessId));
  } catch {
    return { status: "error", message: "That slug is already taken." };
  }

  // Server Actions don't refresh the invoking page's data on their own in
  // this Next.js version (see app/staff/[businessSlug]/actions.ts and
  // app/owner/[businessSlug]/actions.ts for the same pattern) — without
  // this, a saved change (e.g. a corrected Google review link) wouldn't show
  // up until a manual reload, including in this same form's own warning banner.
  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath("/admin/businesses");

  return { status: "idle", message: "Saved." };
}

const addTagSchema = z.object({
  label: z.string().trim().max(60).optional(),
  directActivity: z.string().trim().optional(),
});

export async function addTag(businessId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = addTagSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const db = getDb();
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) return;

  // An unreachable value (tampered POST, or the business's config changed
  // between page load and submit) just falls back to null — same
  // silent-no-op posture the rest of this action already has toward bad
  // input, not a typed error state.
  const directActivity = parsed.data.directActivity
    ? (availableActivities(toPublicBusiness(business)).find((a) => a.id === parsed.data.directActivity)?.id ?? null)
    : null;

  await db.insert(tags).values({
    businessId,
    type: "hub",
    label: parsed.data.label || null,
    claimedAt: new Date(),
    activationCode: generateTagActivationCode(),
    directActivity,
  });

  // Without this, the new tap link/QR code doesn't appear until a manual
  // reload — a plain <form action> mutation doesn't refresh the page on its
  // own in this Next.js version.
  revalidatePath(`/admin/businesses/${businessId}`);
}

const generateTagsSchema = z.object({
  count: z.coerce.number().int().min(1).max(100),
});

// Batch-print inventory: tags with no business bound yet, each carrying its
// own activation code, so a business can claim one at sign-up instead of
// stock being ordered per-business ahead of time.
export async function generateUnclaimedTags(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = generateTagsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const db = getDb();
  await db.insert(tags).values(
    Array.from({ length: parsed.data.count }, () => ({ activationCode: generateTagActivationCode() })),
  );

  revalidatePath("/admin/tags");
}

export type ClaimTagFormState = { status: "idle" | "error"; message?: string };

const claimTagSchema = z.object({
  activationCode: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .refine((v) => v.length > 0, "Enter the tag's activation code"),
  directActivity: z.string().trim().optional(),
});

// The single mechanism for both first-claim and reassignment — always
// allowed regardless of the tag's current state. Re-claiming a tag already
// on this business (just to change directActivity) and moving a tag over
// from a different, e.g. churned, business both go through this same path;
// there's no separate "release" step first.
export async function claimTag(
  businessId: string,
  _prev: ClaimTagFormState,
  formData: FormData,
): Promise<ClaimTagFormState> {
  await requireAdmin();
  const parsed = claimTagSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const db = getDb();
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!business) return { status: "error", message: "Business not found." };

  const [tag] = await db.select().from(tags).where(eq(tags.activationCode, parsed.data.activationCode)).limit(1);
  if (!tag) return { status: "error", message: "No tag has that activation code." };

  let directActivity: string | null = null;
  if (parsed.data.directActivity) {
    const match = availableActivities(toPublicBusiness(business)).find(
      (a) => a.id === parsed.data.directActivity,
    );
    if (!match) {
      return {
        status: "error",
        message: "This business doesn't have a link set up for that yet — add it under Settings first.",
      };
    }
    directActivity = match.id;
  }

  await db.update(tags).set({ businessId, claimedAt: new Date(), directActivity }).where(eq(tags.id, tag.id));

  // The claimed tag needs to disappear from unclaimed inventory and appear
  // in this business's own tap-links list without a manual reload.
  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath("/admin/tags");

  return { status: "idle", message: "Tag claimed." };
}

export async function logoutAdmin(): Promise<void> {
  await clearAdminSession();
  redirect("/admin/login");
}

// Register a DNA punch tag. The two AES-128 keys are generated here and then
// written onto the physical chip during provisioning — they never travel over
// the air on a tap, which is what makes a captured tap URL useless without
// them.
export async function addPunchTag(businessId: string, formData: FormData): Promise<void> {
  await requireAdmin();

  const label = String(formData.get("label") ?? "").trim();
  const db = getDb();

  await db.insert(punchTags).values({
    businessId,
    key: generatePunchTagKey(),
    label: label || null,
    sdmMetaKey: randomBytes(16).toString("hex").toUpperCase(),
    sdmFileKey: randomBytes(16).toString("hex").toUpperCase(),
  });

  redirect(`/admin/businesses/${businessId}`);
}
