"use server";

import { redirect } from "next/navigation";
import {
  createAdminSession,
  destroyAdminSession,
  passwordMatches,
} from "./_lib/auth";

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  if (!passwordMatches(password)) {
    redirect("/admin/vip/login?error=1");
  }

  await createAdminSession();
  redirect("/admin/vip");
}

export async function logoutAction() {
  await destroyAdminSession();
  redirect("/admin/vip/login");
}
