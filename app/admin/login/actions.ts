"use server";

import { redirect } from "next/navigation";
import { setAdminSession } from "@/lib/auth";

export type AdminLoginState = { status: "idle" | "error"; message?: string };

export async function verifyAdminPassword(
  _prev: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    return { status: "error", message: "ADMIN_PASSWORD is not set on the server." };
  }
  if (password !== expected) {
    return { status: "error", message: "Wrong password." };
  }

  await setAdminSession();
  redirect("/admin");
}
