"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { businesses, tags } from "@/db/schema";
import { clearAdminSession, isAdminAuthed } from "@/lib/auth";

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

  await db.insert(tags).values([{ businessId: business.id, type: "hub", label: "Front counter" }]);

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

  return { status: "idle", message: "Saved." };
}

const addTagSchema = z.object({
  label: z.string().trim().max(60).optional(),
});

export async function addTag(businessId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = addTagSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const db = getDb();
  await db.insert(tags).values({
    businessId,
    type: "hub",
    label: parsed.data.label || null,
  });
}

export async function logoutAdmin(): Promise<void> {
  await clearAdminSession();
  redirect("/admin/login");
}
