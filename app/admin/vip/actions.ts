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
  blockMember,
  changeMembershipExpiry,
  checkNewMemberDuplicates,
  completeSafeguardingTask,
  correctMembershipPeriod,
  correctPayment,
  createNewMember,
  findMemberIdentityConflict,
  MembershipActionError,
  openReviewCase,
  reactivateMembership,
  resolveReviewCase,
  restoreMemberAccess,
  renewActiveMembership,
  updateMemberDetails,
  unblockMember,
  updateMembershipPeriodNote,
  updateTelegramUsername,
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
  assertHasChanges,
  buildChangeSet,
  editingActionFailureForCode,
  editingRpcErrorCodeFromDetail,
  requiresStructuralReason,
  validateMemberDetailsDraft,
  validateMembershipPeriodDraft,
  validatePaymentDraft,
  validateTelegramUsernameDraft,
  type MemberDetailsDraft,
  type MembershipPeriodDraft,
  type PaymentDraft,
} from "./_lib/member-editing";
import {
  validateReviewOpenDraft,
  validateReviewResolutionDraft,
} from "./_lib/review-cases";
import {
  buildNewMemberPreview,
  newMemberHardMatchFailure,
  requiresSimilarNameAcknowledgement,
  validateNewMemberDraft,
  type NewMemberDraft,
} from "./_lib/new-member";
import {
  safeguardingActionFailureForCode,
  safeguardingRpcErrorCodeFromDetail,
  validateSafeguardingReason,
  validateSafeguardingSummary,
  validateTelegramRemovalOutcome,
} from "./_lib/safeguarding";

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
    case "ACTION_BLOCKED_BY_SAFEGUARDING":
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
    const failure = newMemberHardMatchFailure(first);
    return {
      ok: false,
      code: failure.code,
      message: failure.message,
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
      if (["DUPLICATE_EMAIL", "DUPLICATE_TELEGRAM", "BLOCKED_MEMBER_MATCH", "PROTECTED_MEMBER_MATCH"].includes(error.code)) {
        const latest = await checkNewMemberDuplicates(validated).catch(() => null);
        const first = latest?.hardMatches[0];
        const failure = first ? newMemberHardMatchFailure(first) : null;
        return {
          ok: false,
          code: failure?.code ?? error.code,
          message: failure?.message ?? "This identity was linked to an existing member before the save completed. Nothing has been saved.",
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


type MemberDetailsSnapshot = {
  display_name: string;
  email: string | null;
  first_joined_on: string | null;
  admin_notes: string | null;
  marketing_status: "unknown" | "allowed" | "opted_out";
};

type MembershipPeriodSnapshot = {
  entitlement_type: "paid" | "complimentary" | "trial" | "lifetime" | "admin";
  plan_name: string | null;
  starts_on: string | null;
  expires_on: string | null;
  expiry_mode: "fixed" | "lifetime" | "manual_no_expiry";
  removal_protected: boolean;
  protection_reason: string | null;
  ended_early_on: string | null;
  admin_note: string | null;
};

type PaymentSnapshot = {
  amount: number | null;
  currency: string | null;
  network: string | null;
  tx_hash: string | null;
  status: "pending" | "verified" | "rejected" | "refunded";
  received_at: string | null;
  notes: string | null;
};

function typedUuid(value: string) {
  if (!UUID_PATTERN.test(value)) throw new Error("Invalid UUID");
  return value;
}

function typedOptionalUuid(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text ? typedUuid(text) : null;
}

function optionalEditingReason(value: string | null | undefined) {
  return normalizeOptionalText(String(value ?? ""), 500);
}

function editingFailure(error: unknown) {
  if (error instanceof MembershipActionError) {
    return editingActionFailureForCode(editingRpcErrorCodeFromDetail(error.code));
  }
  return editingActionFailureForCode(null);
}

function revalidateMemberPages(memberId: string) {
  revalidatePath("/admin/vip");
  revalidatePath(`/admin/vip/${memberId}`);
}

function memberDetailsRpcState(validated: ReturnType<typeof validateMemberDetailsDraft>): MemberDetailsSnapshot {
  return {
    display_name: validated.displayName,
    email: validated.email,
    first_joined_on: validated.firstJoinedOn,
    admin_notes: validated.adminNotes,
    marketing_status: validated.marketingStatus,
  };
}

function membershipPeriodRpcState(
  validated: ReturnType<typeof validateMembershipPeriodDraft>
): MembershipPeriodSnapshot {
  return {
    entitlement_type: validated.entitlementType,
    plan_name: validated.planName,
    starts_on: validated.startsOn,
    expires_on: validated.expiresOn,
    expiry_mode: validated.expiryMode,
    removal_protected: validated.removalProtected,
    protection_reason: validated.protectionReason,
    ended_early_on: validated.endedEarlyOn,
    admin_note: validated.adminNote,
  };
}

function paymentRpcState(validated: ReturnType<typeof validatePaymentDraft>): PaymentSnapshot {
  return {
    amount: validated.amount,
    currency: validated.currency,
    network: validated.network,
    tx_hash: validated.txHash,
    status: validated.status,
    received_at: validated.receivedAt,
    notes: validated.notes,
  };
}

function invalidEditingResult() {
  return editingActionFailureForCode("INVALID_INPUT");
}

function safeguardingFailure(error: unknown) {
  if (error instanceof MembershipActionError) {
    return safeguardingActionFailureForCode(safeguardingRpcErrorCodeFromDetail(error.code));
  }
  return safeguardingActionFailureForCode(null);
}

function expectedSafeguardingVersion(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid safeguarding version.");
  return value;
}

function optionalSafeguardingNote(value: string | null | undefined) {
  return normalizeOptionalText(String(value ?? ""), 1000);
}

export async function updateMemberDetailsAction(input: {
  memberId: string;
  expected: MemberDetailsSnapshot;
  proposed: MemberDetailsDraft;
  reason?: string | null;
}) {
  await requireAdminSession();
  let memberId: string;
  let proposed: MemberDetailsSnapshot;
  let reason: string | null;
  try {
    memberId = typedUuid(input.memberId);
    proposed = memberDetailsRpcState(validateMemberDetailsDraft(input.proposed));
    const changes = buildChangeSet(input.expected, proposed);
    assertHasChanges(changes);
    reason = optionalEditingReason(input.reason);
    if (requiresStructuralReason(changes.map((change) => change.field))) {
      reason = validateReason(String(input.reason ?? ""));
    }
  } catch {
    return invalidEditingResult();
  }

  try {
    await updateMemberDetails({
      memberId,
      expected: input.expected,
      proposed,
      reason,
      actorId: "vip-admin",
    });
    revalidateMemberPages(memberId);
    return { ok: true } as const;
  } catch (error) {
    if (error instanceof MembershipActionError && error.code === "PROTECTED_IDENTITY_CONFLICT") {
      const conflict = await findMemberIdentityConflict({
        excludeMemberId: memberId, email: proposed.email,
      }).catch(() => null);
      return { ...safeguardingFailure(error), existingMemberId: conflict?.memberId } as const;
    }
    const failure = editingFailure(error);
    if (failure.code === "DUPLICATE_EMAIL") {
      const conflict = await findMemberIdentityConflict({
        excludeMemberId: memberId,
        email: proposed.email,
      }).catch(() => null);
      return { ...failure, existingMemberId: conflict?.memberId } as const;
    }
    return failure;
  }
}

export async function updateTelegramUsernameAction(input: {
  memberId: string;
  telegramAccountId: string | null;
  expectedUsername: string | null;
  proposedUsername: string | null;
  reason?: string | null;
}) {
  await requireAdminSession();
  let memberId: string;
  let telegramAccountId: string | null;
  let expectedUsername: string | null;
  let newUsername: string | null;
  let reason: string | null;
  try {
    memberId = typedUuid(input.memberId);
    telegramAccountId = typedOptionalUuid(input.telegramAccountId);
    expectedUsername = validateTelegramUsernameDraft({
      telegramUsername: input.expectedUsername,
    }).telegramUsername;
    newUsername = validateTelegramUsernameDraft({
      telegramUsername: input.proposedUsername,
    }).telegramUsername;
    assertHasChanges(
      buildChangeSet(
        { telegram_username: expectedUsername },
        { telegram_username: newUsername }
      )
    );
    reason = optionalEditingReason(input.reason);
  } catch {
    return invalidEditingResult();
  }

  try {
    await updateTelegramUsername({
      memberId,
      telegramAccountId,
      expectedUsername,
      newUsername,
      reason,
      actorId: "vip-admin",
    });
    revalidateMemberPages(memberId);
    return { ok: true } as const;
  } catch (error) {
    if (error instanceof MembershipActionError && error.code === "PROTECTED_IDENTITY_CONFLICT") {
      const conflict = await findMemberIdentityConflict({
        excludeMemberId: memberId, telegramUsername: newUsername,
      }).catch(() => null);
      return { ...safeguardingFailure(error), existingMemberId: conflict?.memberId } as const;
    }
    const failure = editingFailure(error);
    if (failure.code === "DUPLICATE_TELEGRAM") {
      const conflict = await findMemberIdentityConflict({
        excludeMemberId: memberId,
        telegramUsername: newUsername,
      }).catch(() => null);
      return { ...failure, existingMemberId: conflict?.memberId } as const;
    }
    return failure;
  }
}

export async function correctMembershipPeriodAction(input: {
  memberId: string;
  periodId: string;
  expected: MembershipPeriodSnapshot;
  proposed: MembershipPeriodDraft;
  reason: string;
}) {
  await requireAdminSession();
  let memberId: string;
  let periodId: string;
  let proposed: MembershipPeriodSnapshot;
  let reason: string;
  try {
    memberId = typedUuid(input.memberId);
    periodId = typedUuid(input.periodId);
    proposed = membershipPeriodRpcState(validateMembershipPeriodDraft(input.proposed));
    assertHasChanges(buildChangeSet(input.expected, proposed));
    reason = validateReason(input.reason);
  } catch {
    return invalidEditingResult();
  }
  try {
    await correctMembershipPeriod({
      memberId,
      periodId,
      expected: input.expected,
      proposed,
      reason,
      actorId: "vip-admin",
    });
    revalidateMemberPages(memberId);
    return { ok: true } as const;
  } catch (error) {
    return editingFailure(error);
  }
}

export async function correctPaymentAction(input: {
  memberId: string;
  paymentId: string;
  expected: PaymentSnapshot;
  proposed: PaymentDraft;
  reason: string;
}) {
  await requireAdminSession();
  let memberId: string;
  let paymentId: string;
  let proposed: PaymentSnapshot;
  let reason: string;
  try {
    memberId = typedUuid(input.memberId);
    paymentId = typedUuid(input.paymentId);
    proposed = paymentRpcState(validatePaymentDraft(input.proposed));
    assertHasChanges(buildChangeSet(input.expected, proposed));
    reason = validateReason(input.reason);
  } catch {
    return invalidEditingResult();
  }
  try {
    await correctPayment({
      memberId,
      paymentId,
      expected: input.expected,
      proposed,
      reason,
      actorId: "vip-admin",
    });
    revalidateMemberPages(memberId);
    return { ok: true } as const;
  } catch (error) {
    return editingFailure(error);
  }
}

export async function openReviewCaseAction(input: {
  memberId: string;
  membershipPeriodId?: string | null;
  paymentId?: string | null;
  category: string;
  reason: string;
}) {
  await requireAdminSession();
  let memberId: string;
  let membershipPeriodId: string | null;
  let paymentId: string | null;
  let review;
  try {
    memberId = typedUuid(input.memberId);
    membershipPeriodId = typedOptionalUuid(input.membershipPeriodId);
    paymentId = typedOptionalUuid(input.paymentId);
    if (membershipPeriodId && paymentId) throw new Error("Only one linked entity is allowed.");
    review = validateReviewOpenDraft({ category: input.category, reason: input.reason });
  } catch {
    return invalidEditingResult();
  }
  try {
    await openReviewCase({
      memberId,
      membershipPeriodId,
      paymentId,
      category: review.category,
      reason: review.reason,
      actorId: "vip-admin",
    });
    revalidateMemberPages(memberId);
    return { ok: true } as const;
  } catch (error) {
    return editingFailure(error);
  }
}

export async function resolveReviewCaseAction(input: {
  caseId: string;
  memberId: string;
  outcome: string;
  note: string;
}) {
  await requireAdminSession();
  let caseId: string;
  let memberId: string;
  let resolution;
  try {
    caseId = typedUuid(input.caseId);
    memberId = typedUuid(input.memberId);
    resolution = validateReviewResolutionDraft({ outcome: input.outcome, note: input.note });
  } catch {
    return invalidEditingResult();
  }
  try {
    await resolveReviewCase({
      caseId,
      memberId,
      outcome: resolution.outcome,
      note: resolution.note,
      actorId: "vip-admin",
    });
    revalidateMemberPages(memberId);
    return { ok: true } as const;
  } catch (error) {
    return editingFailure(error);
  }
}


export async function blockMemberAction(input: {
  memberId: string; expectedVersion: number; summary: string; reason: string; confirmed: boolean;
}) {
  await requireAdminSession();
  let memberId: string; let expectedVersion: number; let summary: string; let reason: string;
  try {
    memberId = typedUuid(input.memberId);
    expectedVersion = expectedSafeguardingVersion(input.expectedVersion);
    summary = validateSafeguardingSummary(input.summary);
    reason = validateSafeguardingReason(input.reason);
    if (!input.confirmed) return safeguardingActionFailureForCode("SAFEGUARDING_CONFIRMATION_REQUIRED");
  } catch { return safeguardingActionFailureForCode(null); }
  try {
    await blockMember({ memberId, expectedVersion, summary, reason, confirmed: true, actorId: "vip-admin" });
    revalidateMemberPages(memberId); return { ok: true } as const;
  } catch (error) { return safeguardingFailure(error); }
}

export async function unblockMemberAction(input: {
  memberId: string; expectedVersion: number; reason: string; acknowledged: boolean;
}) {
  await requireAdminSession();
  let memberId: string; let expectedVersion: number; let reason: string;
  try {
    memberId = typedUuid(input.memberId); expectedVersion = expectedSafeguardingVersion(input.expectedVersion);
    reason = validateSafeguardingReason(input.reason);
    if (!input.acknowledged) return safeguardingActionFailureForCode("SAFEGUARDING_CONFIRMATION_REQUIRED");
  } catch { return safeguardingActionFailureForCode(null); }
  try {
    await unblockMember({ memberId, expectedVersion, reason, acknowledged: true, actorId: "vip-admin" });
    revalidateMemberPages(memberId); return { ok: true } as const;
  } catch (error) { return safeguardingFailure(error); }
}

export async function restoreMemberAccessAction(input: {
  memberId: string; expectedVersion: number; reason: string; confirmed: boolean;
}) {
  await requireAdminSession();
  let memberId: string; let expectedVersion: number; let reason: string;
  try {
    memberId = typedUuid(input.memberId); expectedVersion = expectedSafeguardingVersion(input.expectedVersion);
    reason = validateSafeguardingReason(input.reason);
    if (!input.confirmed) return safeguardingActionFailureForCode("SAFEGUARDING_CONFIRMATION_REQUIRED");
  } catch { return safeguardingActionFailureForCode(null); }
  try {
    await restoreMemberAccess({ memberId, expectedVersion, reason, confirmed: true, actorId: "vip-admin" });
    revalidateMemberPages(memberId); return { ok: true } as const;
  } catch (error) { return safeguardingFailure(error); }
}

export async function completeSafeguardingTaskAction(input: {
  memberId: string; taskId: string; outcome: string; note?: string | null;
}) {
  await requireAdminSession();
  let memberId: string; let taskId: string; let outcome; let note: string | null;
  try {
    memberId = typedUuid(input.memberId); taskId = typedUuid(input.taskId);
    outcome = validateTelegramRemovalOutcome(input.outcome);
    note = optionalSafeguardingNote(input.note);
  } catch { return safeguardingActionFailureForCode(null); }
  try {
    await completeSafeguardingTask({ memberId, taskId, outcome, note, actorId: "vip-admin" });
    revalidateMemberPages(memberId); return { ok: true } as const;
  } catch (error) { return safeguardingFailure(error); }
}
