"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAdminSession,
  destroyAdminSession,
  hasAdminSession,
  passwordMatches,
} from "./_lib/auth";
import { updateMembershipPeriodNote } from "./_lib/data";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function updateMembershipNoteAction(formData: FormData) {
  if (!(await hasAdminSession())) {
    redirect("/admin/vip/login");
  }

  const memberId = String(formData.get("memberId") ?? "");
  const periodId = String(formData.get("periodId") ?? "");
  const note = String(formData.get("note") ?? "");

  if (!UUID_PATTERN.test(memberId) || !UUID_PATTERN.test(periodId)) {
    throw new Error("Invalid member or membership-period identifier.");
  }

  if (note.length > 4000) {
    redirect(`/admin/vip/${memberId}?note=too-long`);
  }

  await updateMembershipPeriodNote({
    memberId,
    periodId,
    note,
    actorId: "vip-admin",
  });

  revalidatePath(`/admin/vip/${memberId}`);
  redirect(`/admin/vip/${memberId}?note=saved`);
}
