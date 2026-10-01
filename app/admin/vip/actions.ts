"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAdminSession,
  destroyAdminSession,
  hasAdminSession,
  passwordMatches,
} from "./_lib/auth";
import {
  addMembershipTime,
  changeMembershipExpiry,
  checkNewMemberDuplicates,
  createNewMember,
  MembershipActionError,
  reactivateMembership,
  renewActiveMembership,
  updateMembershipPeriodNote,
} from "./_lib/data";
import {
  assertIsoDate,
  normalizeCurrency,
  normalizeOptionalText,
  validatePositiveWholeNumber,
  validateReason,
  validateRenewAmount,
  type DurationUnit,
} from "./_lib/membership-actions";
import {
  buildNewMemberPreview,
  requiresSimilarNameAcknowledgement,
  validateNewMemberDraft,
  type NewMemberDraft,
} from "./_lib/new-member";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeMemberId(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "");
  if (!UUID_PATTERN.test(memberId)) redirect("/admin/vip");
  return memberId;
}

function requiredUuid(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  if (!UUID_PATTERN.test(text)) throw new Error("Invalid UUID");
  return text;
}

function optionalUuid(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!UUID_PATTERN.test(text)) throw new Error("Invalid UUID");
  return text;
}

function durationUnit(value: FormDataEntryValue | null): DurationUnit {
  const text = String(value ?? "");
  if (text !== "days" && text !== "months") throw new Error("Invalid duration unit");
  return text;
}

function actionErrorQuery(error: MembershipActionError) {
  switch (error.code) {
    case "STALE_PREVIEW":
      return "stale";
    case "PAST_EXPIRY_ACK_REQUIRED":
      return "past-ack";
    case "ACTION_NOT_ALLOWED":
      return "not-allowed";
    case "OVERLAPPING_ENTITLEMENT":
      return "overlap";
    case "INVALID_INPUT":
    default:
      return "invalid";
  }
}

async function requireAdminSession() {
  if (!(await hasAdminSession())) redirect("/admin/vip/login");
}

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

function validationMessage(error: unknown) {
  return error instanceof Error ? error.message : "Please check the member details and try again.";
}

export async function checkNewMemberDuplicatesAction(input: NewMemberDraft) {
  await requireAdminSession();

  let preview;
  try {
    preview = buildNewMemberPreview(input);
  } catch (error) {
    return { ok: false, code: "INVALID_INPUT", message: validationMessage(error) } as const;
  }

  try {
    const duplicates = await checkNewMemberDuplicates(preview);
    return { ok: true, preview, duplicates } as const;
  } catch {
    return {
      ok: false,
      code: "SERVER_ERROR",
      message: "The duplicate check could not be completed. Nothing has been saved.",
    } as const;
  }
}

export async function createNewMemberAction(input: NewMemberDraft) {
  await requireAdminSession();

  let validated;
  try {
    validated = validateNewMemberDraft(input);
  } catch (error) {
    return { ok: false, code: "INVALID_INPUT", message: validationMessage(error) } as const;
  }

  let duplicates;
  try {
    duplicates = await checkNewMemberDuplicates(validated);
  } catch {
    return {
      ok: false,
      code: "SERVER_ERROR",
      message: "The duplicate check could not be completed. Nothing has been saved.",
    } as const;
  }

  if (duplicates.hardMatches.length > 0) {
    const first = duplicates.hardMatches[0];
    return {
      ok: false,
      code: first.field === "email" ? "DUPLICATE_EMAIL" : "DUPLICATE_TELEGRAM",
      message: "This identity already belongs to an existing member. No new member was created.",
      existingMemberId: first.memberId,
      hardMatches: duplicates.hardMatches,
    } as const;
  }

  if (
    requiresSimilarNameAcknowledgement(
      duplicates.similarNameMatches.length,
      validated.similarNameAcknowledged
    )
  ) {
    return {
      ok: false,
      code: "SIMILAR_NAME_ACK_REQUIRED",
      message: "Confirm that this is genuinely a new person before creating the member.",
      similarNameMatches: duplicates.similarNameMatches,
    } as const;
  }

  try {
    const created = await createNewMember(validated, "vip-admin");
    revalidatePath("/admin/vip");
    revalidatePath(`/admin/vip/${created.member_id}`);
    return { ok: true, memberId: created.member_id } as const;
  } catch (error) {
    if (error instanceof MembershipActionError) {
      if (error.code === "DUPLICATE_EMAIL" || error.code === "DUPLICATE_TELEGRAM") {
        const latest = await checkNewMemberDuplicates(validated).catch(() => null);
        const first = latest?.hardMatches[0];
        return {
          ok: false,
          code: error.code,
          message: "This identity was linked to an existing member before the save completed.",
          existingMemberId: first?.memberId,
          hardMatches: latest?.hardMatches ?? [],
        } as const;
      }
      if (error.code === "DUPLICATE_TX_HASH") {
        return {
          ok: false,
          code: "DUPLICATE_TX_HASH",
          message: "That transaction hash is already recorded. Nothing has been saved.",
        } as const;
      }
      if (error.code === "INVALID_INPUT") {
        return { ok: false, code: "INVALID_INPUT", message: "The submitted member details are invalid." } as const;
      }
    }
    return {
      ok: false,
      code: "SERVER_ERROR",
      message: "The member could not be created. Nothing has been saved.",
    } as const;
  }
}

export async function updateMembershipNoteAction(formData: FormData) {
  await requireAdminSession();

  const memberId = safeMemberId(formData);
  const periodId = String(formData.get("periodId") ?? "");
  const note = String(formData.get("note") ?? "");

  if (!UUID_PATTERN.test(periodId)) {
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

export async function changeExpiryAction(formData: FormData) {
  await requireAdminSession();
  const memberId = safeMemberId(formData);

  let input: Parameters<typeof changeMembershipExpiry>[0];
  try {
    input = {
      memberId,
      periodId: requiredUuid(formData.get("periodId")),
      expectedExpiry: assertIsoDate(String(formData.get("expectedExpiry") ?? "")),
      newExpiry: assertIsoDate(String(formData.get("newExpiry") ?? "")),
      reason: validateReason(String(formData.get("reason") ?? "")),
      pastAcknowledged: String(formData.get("pastAcknowledged") ?? "") === "true",
      actorId: "vip-admin",
    };
  } catch {
    redirect(`/admin/vip/${memberId}?actionError=invalid`);
  }

  try {
    await changeMembershipExpiry(input!);
  } catch (error) {
    if (error instanceof MembershipActionError) {
      redirect(`/admin/vip/${memberId}?actionError=${actionErrorQuery(error)}`);
    }
    throw error;
  }

  revalidatePath(`/admin/vip/${memberId}`);
  revalidatePath("/admin/vip");
  redirect(`/admin/vip/${memberId}?action=expiry-changed`);
}

export async function addTimeAction(formData: FormData) {
  await requireAdminSession();
  const memberId = safeMemberId(formData);

  let input: Parameters<typeof addMembershipTime>[0];
  try {
    input = {
      memberId,
      periodId: requiredUuid(formData.get("periodId")),
      expectedExpiry: assertIsoDate(String(formData.get("expectedExpiry") ?? "")),
      value: validatePositiveWholeNumber(String(formData.get("durationValue") ?? "")),
      unit: durationUnit(formData.get("durationUnit")),
      reason: validateReason(String(formData.get("reason") ?? "")),
      actorId: "vip-admin",
    };
  } catch {
    redirect(`/admin/vip/${memberId}?actionError=invalid`);
  }

  try {
    await addMembershipTime(input!);
  } catch (error) {
    if (error instanceof MembershipActionError) {
      redirect(`/admin/vip/${memberId}?actionError=${actionErrorQuery(error)}`);
    }
    throw error;
  }

  revalidatePath(`/admin/vip/${memberId}`);
  revalidatePath("/admin/vip");
  redirect(`/admin/vip/${memberId}?action=time-added`);
}

export async function renewMembershipAction(formData: FormData) {
  await requireAdminSession();
  const memberId = safeMemberId(formData);
  const mode = String(formData.get("mode") ?? "");

  let common: {
    value: number;
    unit: DurationUnit;
    amount: number;
    currency: string;
    paymentDate: string;
    txHash: string | null;
    paymentNote: string | null;
    reason: string;
  };

  try {
    common = {
      value: validatePositiveWholeNumber(String(formData.get("durationValue") ?? "")),
      unit: durationUnit(formData.get("durationUnit")),
      amount: validateRenewAmount(String(formData.get("amount") ?? "")),
      currency: normalizeCurrency(String(formData.get("currency") ?? "USDT")),
      paymentDate: assertIsoDate(String(formData.get("paymentDate") ?? "")),
      txHash: normalizeOptionalText(String(formData.get("txHash") ?? ""), 200),
      paymentNote: normalizeOptionalText(String(formData.get("paymentNote") ?? ""), 2000),
      reason: validateReason(String(formData.get("reason") ?? "")),
    };
  } catch {
    redirect(`/admin/vip/${memberId}?actionError=invalid`);
  }

  try {
    if (mode === "active-renewal") {
      await renewActiveMembership({
        memberId,
        periodId: requiredUuid(formData.get("periodId")),
        expectedExpiry: assertIsoDate(String(formData.get("expectedExpiry") ?? "")),
        ...common!,
        actorId: "vip-admin",
      });
    } else if (mode === "reactivation") {
      const expectedLatestPeriodId = optionalUuid(formData.get("expectedLatestPeriodId"));
      const expectedLatestExpiryRaw = String(formData.get("expectedLatestExpiry") ?? "").trim();
      await reactivateMembership({
        memberId,
        expectedLatestPeriodId,
        expectedLatestExpiry: expectedLatestExpiryRaw
          ? assertIsoDate(expectedLatestExpiryRaw)
          : null,
        reactivationStart: assertIsoDate(String(formData.get("reactivationStart") ?? "")),
        ...common!,
        actorId: "vip-admin",
      });
    } else {
      redirect(`/admin/vip/${memberId}?actionError=invalid`);
    }
  } catch (error) {
    if (error instanceof MembershipActionError) {
      redirect(`/admin/vip/${memberId}?actionError=${actionErrorQuery(error)}`);
    }
    if (error instanceof Error && (error.message === "Invalid UUID" || error.message.includes("Date"))) {
      redirect(`/admin/vip/${memberId}?actionError=invalid`);
    }
    throw error;
  }

  revalidatePath(`/admin/vip/${memberId}`);
  revalidatePath("/admin/vip");
  redirect(
    `/admin/vip/${memberId}?action=${mode === "reactivation" ? "reactivated" : "renewed"}`
  );
}
