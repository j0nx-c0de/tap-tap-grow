"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import { clearOwnerSession, setOwnerSession } from "@/lib/auth";
import { consumeToken, requestLogin, type LoginChannel } from "@/lib/owner-login";

export type SignInState = {
  status: "idle" | "sent" | "error";
  channel?: LoginChannel;
  message?: string;
};

async function findBusiness(slug: string) {
  const db = getDb();
  const [business] = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
  return business ?? null;
}

export async function requestOwnerLogin(
  businessSlug: string,
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const channel = String(formData.get("channel") ?? "");
  if (channel !== "email" && channel !== "sms") {
    return { status: "error", message: "Something went wrong — try again." };
  }

  const business = await findBusiness(businessSlug);
  if (!business) return { status: "error", message: "Something went wrong — try again." };

  const result = await requestLogin(getDb(), business, channel);

  if (result.status === "throttled") {
    return { status: "error", message: "Too many sign-in requests — try again in a few minutes." };
  }
  if (result.status === "unavailable") {
    return { status: "error", message: "That contact method isn't on file for this business." };
  }

  return {
    status: "sent",
    channel,
    message:
      channel === "email"
        ? "Check your email for a sign-in link."
        : "We texted you a 6-digit code.",
  };
}

export async function verifyOwnerCode(
  businessSlug: string,
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!code) return { status: "sent", channel: "sms", message: "Enter the 6-digit code." };

  const business = await findBusiness(businessSlug);
  if (!business) return { status: "error", message: "Something went wrong — try again." };

  const result = await consumeToken(getDb(), business.id, "sms", code);
  if (!result.ok) {
    return {
      status: "sent",
      channel: "sms",
      message:
        result.reason === "locked"
          ? "Too many wrong tries — request a new code."
          : "That code isn't right. Check it and try again.",
    };
  }

  await setOwnerSession(business.id);
  revalidatePath(`/owner/${businessSlug}`);
  return { status: "idle" };
}

export async function signOutOwner(businessSlug: string): Promise<void> {
  const business = await findBusiness(businessSlug);
  if (business) await clearOwnerSession(business.id);
  revalidatePath(`/owner/${businessSlug}`);
}
