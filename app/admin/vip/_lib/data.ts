import "server-only";

import type { DurationUnit } from "./membership-actions";
import {
  editingRpcErrorCodeFromDetail,
  type EditingRpcErrorCode,
} from "./member-editing";
import {
  isSimilarDisplayName,
  newMemberRpcErrorCodeFromDetail,
  normalizeEmail,
  normalizeTelegramUsername,
  type NewMemberRpcErrorCode,
  type ValidatedNewMemberDraft,
} from "./new-member";

export type MemberOverview = {
  member_id: string;
  legacy_member_code: string | null;
  display_name: string;
  membership_period_id: string | null;
  entitlement_type: "paid" | "complimentary" | "trial" | "lifetime" | "admin" | null;
  starts_on: string | null;
  expires_on: string | null;
  expiry_mode: "fixed" | "lifetime" | "manual_no_expiry" | null;
  removal_protected: boolean;
  migration_review: boolean;
  status: "ACTIVE" | "FORMER" | "LIFETIME";
  telegram_user_id: number | null;
  telegram_username: string | null;
  telegram_raw: string | null;
  telegram_linked_at: string | null;
  dm_available: boolean;
  email: string | null;
  first_joined_on: string | null;
  marketing_status: "unknown" | "allowed" | "opted_out";
  admin_notes: string | null;
  event_count: number;
  payment_count: number;
  open_review_count: number;
  review_categories: string[];
  review_reason: string | null;
  review_opened_at: string | null;
};

export type MemberHistory = {
  member_id: string;
  legacy_member_code: string | null;
  display_name: string;
  event_id: string;
  membership_period_id: string | null;
  event_type: string;
  occurred_at: string;
  old_expiry: string | null;
  new_expiry: string | null;
  adjustment_value: number | null;
  adjustment_unit: string | null;
  reason: string | null;
  actor_type: string;
  actor_id: string | null;
  metadata: Record<string, unknown>;
};

export type MemberPeriod = {
  membership_period_id: string;
  member_id: string;
  entitlement_type: "paid" | "complimentary" | "trial" | "lifetime" | "admin";
  plan_name: string | null;
  source: string;
  starts_on: string | null;
  expires_on: string | null;
  expiry_mode: "fixed" | "lifetime" | "manual_no_expiry";
  removal_protected: boolean;
  protection_reason: string | null;
  ended_early_on: string | null;
  legacy_notes: string | null;
  admin_note: string | null;
  note_updated_at: string | null;
  note_updated_by: string | null;
  migration_review: boolean;
  created_at: string;
  period_status: "CURRENT" | "HISTORICAL" | "FUTURE";
};

export type MemberPayment = {
  payment_id: string;
  member_id: string;
  membership_period_id: string | null;
  offer_id: string | null;
  amount: number | null;
  currency: string | null;
  network: string | null;
  tx_hash: string | null;
  status: "pending" | "verified" | "rejected" | "refunded";
  verification_method: "manual" | "blockchain";
  received_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  notes: string | null;
  created_at: string;
};

export type MemberTelegramAccount = {
  telegram_account_id: string;
  member_id: string;
  telegram_user_id: number | null;
  telegram_username: string | null;
  telegram_raw: string | null;
  bot_started_at: string | null;
  linked_at: string | null;
  dm_available: boolean;
  last_verified_at: string | null;
  created_at: string;
};

export type MemberReviewCase = {
  id: string;
  member_id: string;
  membership_period_id: string | null;
  payment_id: string | null;
  origin: "legacy_migration" | "manual" | "add_member";
  category: "identity_contact" | "membership" | "payment" | "telegram" | "historical" | "other";
  opening_reason: string;
  status: "OPEN" | "RESOLVED";
  opened_at: string;
  opened_by: string;
  resolution_outcome: "CORRECTED_DATA_UPDATED" | "EXISTING_DATA_CONFIRMED" | "HISTORICAL_DETAIL_UNKNOWN_ACCEPTED" | null;
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
};

export type MemberReviewSummary = {
  member_id: string;
  open_review_count: number;
  review_categories: string[];
  review_reason: string;
  review_opened_at: string;
};

export type MembershipActionResult = {
  member_id: string;
  membership_period_id: string;
  old_expiry: string | null;
  new_expiry: string;
  payment_id: string | null;
  event_id: string;
};

export type NewMemberDuplicateMatch = {
  memberId: string;
  displayName: string;
  field: "email" | "telegram";
};

export type MemberIdentityConflict = NewMemberDuplicateMatch;

export type NewMemberSimilarNameMatch = {
  memberId: string;
  displayName: string;
};

export type NewMemberDuplicateResult = {
  hardMatches: NewMemberDuplicateMatch[];
  similarNameMatches: NewMemberSimilarNameMatch[];
};

export type NewMemberCreateResult = {
  member_id: string;
  membership_period_id: string;
  payment_id: string | null;
  telegram_account_id: string | null;
  event_id: string;
};

export type MembershipActionErrorCode =
  | "STALE_PREVIEW"
  | "PAST_EXPIRY_ACK_REQUIRED"
  | "ACTION_NOT_ALLOWED"
  | "INVALID_INPUT"
  | "OVERLAPPING_ENTITLEMENT"
  | EditingRpcErrorCode
  | NewMemberRpcErrorCode;

export class MembershipActionError extends Error {
  code: MembershipActionErrorCode;

  constructor(code: MembershipActionErrorCode) {
    super(code);
    this.name = "MembershipActionError";
    this.code = code;
  }
}

type SupabaseRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured on the server."
    );
  }

  return { url: url.replace(/\/$/, ""), key };
}

function actionErrorFromDetail(detail: string): MembershipActionError | null {
  const editingCode = editingRpcErrorCodeFromDetail(detail);
  if (editingCode) return new MembershipActionError(editingCode);

  const newMemberCode = newMemberRpcErrorCodeFromDetail(detail);
  if (newMemberCode) return new MembershipActionError(newMemberCode);

  const codes: MembershipActionErrorCode[] = [
    "PAST_EXPIRY_ACK_REQUIRED",
    "ACTION_NOT_ALLOWED",
  ];
  const code = codes.find((candidate) => detail.includes(candidate));
  return code ? new MembershipActionError(code) : null;
}

async function supabaseRest<T>(
  path: string,
  options: SupabaseRequestOptions = {}
): Promise<T> {
  const { url, key } = config();
  const method = options.method ?? "GET";
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    const safeActionError = actionErrorFromDetail(detail);
    if (safeActionError) throw safeActionError;

    const operation = method === "GET" ? "read" : "write";
    throw new Error(
      `Supabase dashboard ${operation} failed (${response.status}): ${detail}`
    );
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function getOpenReviewSummaries() {
  return supabaseRest<MemberReviewSummary[]>(
    "admin_member_review_summary?select=*&order=review_opened_at.asc,member_id.asc"
  );
}

export async function getMembers(): Promise<MemberOverview[]> {
  type BaseMemberOverview = Omit<
    MemberOverview,
    "open_review_count" | "review_categories" | "review_reason" | "review_opened_at"
  >;
  const [members, summaries] = await Promise.all([
    supabaseRest<BaseMemberOverview[]>(
      "admin_member_overview?select=*&order=status.asc,expires_on.asc.nullslast,display_name.asc"
    ),
    getOpenReviewSummaries(),
  ]);
  const reviewByMember = new Map(summaries.map((summary) => [summary.member_id, summary]));
  return members.map((member) => {
    const review = reviewByMember.get(member.member_id);
    return {
      ...member,
      open_review_count: review?.open_review_count ?? 0,
      review_categories: review?.review_categories ?? [],
      review_reason: review?.review_reason ?? null,
      review_opened_at: review?.review_opened_at ?? null,
    };
  });
}

export async function checkNewMemberDuplicates(
  input: Pick<ValidatedNewMemberDraft, "displayName" | "email" | "telegramUsername">
): Promise<NewMemberDuplicateResult> {
  const [members, telegramAccounts] = await Promise.all([
    supabaseRest<Array<{ id: string; display_name: string; email: string | null }>>(
      "members?select=id,display_name,email&order=display_name.asc"
    ),
    supabaseRest<Array<{ member_id: string; telegram_username: string | null }>>(
      "telegram_accounts?select=member_id,telegram_username"
    ),
  ]);

  const memberById = new Map(members.map((member) => [member.id, member]));
  const hardMatches: NewMemberDuplicateMatch[] = [];

  if (input.email) {
    for (const member of members) {
      if (member.email?.trim().toLowerCase() === input.email) {
        hardMatches.push({ memberId: member.id, displayName: member.display_name, field: "email" });
      }
    }
  }

  if (input.telegramUsername) {
    for (const account of telegramAccounts) {
      const normalized = account.telegram_username?.trim().replace(/^@/, "").toLowerCase();
      if (normalized === input.telegramUsername) {
        const member = memberById.get(account.member_id);
        hardMatches.push({
          memberId: account.member_id,
          displayName: member?.display_name ?? "Existing member",
          field: "telegram",
        });
      }
    }
  }

  const similarNameMatches = members
    .filter((member) => {
      try {
        return isSimilarDisplayName(input.displayName, member.display_name);
      } catch {
        return false;
      }
    })
    .map((member) => ({ memberId: member.id, displayName: member.display_name }));

  return { hardMatches, similarNameMatches };
}

export async function getMember(memberId: string): Promise<MemberOverview | null> {
  type BaseMemberOverview = Omit<
    MemberOverview,
    "open_review_count" | "review_categories" | "review_reason" | "review_opened_at"
  >;
  const encoded = encodeURIComponent(memberId);
  const [rows, summaries] = await Promise.all([
    supabaseRest<BaseMemberOverview[]>(
      `admin_member_overview?select=*&member_id=eq.${encoded}&limit=1`
    ),
    supabaseRest<MemberReviewSummary[]>(
      `admin_member_review_summary?select=*&member_id=eq.${encoded}&limit=1`
    ),
  ]);
  const member = rows[0];
  if (!member) return null;
  const review = summaries[0];
  return {
    ...member,
    open_review_count: review?.open_review_count ?? 0,
    review_categories: review?.review_categories ?? [],
    review_reason: review?.review_reason ?? null,
    review_opened_at: review?.review_opened_at ?? null,
  };
}

export async function getMemberPeriods(memberId: string) {
  return supabaseRest<MemberPeriod[]>(
    `admin_membership_periods?select=*&member_id=eq.${encodeURIComponent(
      memberId
    )}&order=starts_on.desc.nullslast,created_at.desc`
  );
}

export async function getMemberHistory(memberId: string) {
  return supabaseRest<MemberHistory[]>(
    `admin_member_history?select=*&member_id=eq.${encodeURIComponent(
      memberId
    )}&order=occurred_at.desc`
  );
}

export async function getMemberPayments(memberId: string) {
  return supabaseRest<MemberPayment[]>(
    `payments?select=payment_id:id,member_id,membership_period_id,offer_id,amount,currency,network,tx_hash,status,verification_method,received_at,verified_at,verified_by,notes,created_at&member_id=eq.${encodeURIComponent(
      memberId
    )}&order=received_at.desc.nullslast,created_at.desc`
  );
}

export async function getMemberTelegramAccounts(memberId: string) {
  return supabaseRest<MemberTelegramAccount[]>(
    `telegram_accounts?select=telegram_account_id:id,member_id,telegram_user_id,telegram_username,telegram_raw,bot_started_at,linked_at,dm_available,last_verified_at,created_at&member_id=eq.${encodeURIComponent(
      memberId
    )}&order=created_at.asc`
  );
}

export async function getMemberReviewCases(memberId: string) {
  return supabaseRest<MemberReviewCase[]>(
    `member_review_cases?select=*&member_id=eq.${encodeURIComponent(
      memberId
    )}&order=status.asc,opened_at.desc`
  );
}

export async function findMemberIdentityConflict(input: {
  excludeMemberId: string;
  email?: string | null;
  telegramUsername?: string | null;
}): Promise<MemberIdentityConflict | null> {
  const email = normalizeEmail(String(input.email ?? ""));
  const telegramUsername = normalizeTelegramUsername(String(input.telegramUsername ?? ""));
  const [members, telegramAccounts] = await Promise.all([
    supabaseRest<Array<{ id: string; display_name: string; email: string | null }>>(
      "members?select=id,display_name,email&order=id.asc"
    ),
    supabaseRest<Array<{ member_id: string; telegram_username: string | null }>>(
      "telegram_accounts?select=member_id,telegram_username&order=member_id.asc,id.asc"
    ),
  ]);
  if (email) {
    const match = members.find(
      (member) => member.id !== input.excludeMemberId && member.email?.trim().toLowerCase() === email
    );
    if (match) return { memberId: match.id, displayName: match.display_name, field: "email" };
  }
  if (telegramUsername) {
    const memberById = new Map(members.map((member) => [member.id, member]));
    const account = telegramAccounts.find(
      (row) =>
        row.member_id !== input.excludeMemberId &&
        row.telegram_username?.trim().replace(/^@/, "").toLowerCase() === telegramUsername
    );
    if (account) {
      return {
        memberId: account.member_id,
        displayName: memberById.get(account.member_id)?.display_name ?? "Existing member",
        field: "telegram",
      };
    }
  }
  return null;
}

export async function createNewMember(
  input: ValidatedNewMemberDraft,
  actorId = "vip-admin"
): Promise<NewMemberCreateResult> {
  const rows = await supabaseRest<NewMemberCreateResult[]>("rpc/admin_create_member", {
    method: "POST",
    body: {
      p_display_name: input.displayName,
      p_email: input.email,
      p_telegram_username: input.telegramUsername,
      p_entitlement_type: input.entitlementType,
      p_start_date: input.startDate,
      p_duration_value: input.durationValue,
      p_duration_unit: input.durationUnit,
      p_final_expiry: input.finalExpiry,
      p_expiry_override_reason: input.expiryOverrideReason,
      p_reason: input.reason,
      p_amount: input.amount,
      p_currency: input.currency,
      p_payment_date: input.paymentDate,
      p_tx_hash: input.txHash,
      p_payment_note: input.paymentNote,
      p_actor_id: actorId,
    },
  });

  if (!rows?.[0]) throw new Error("Supabase Add Member returned no result.");
  return rows[0];
}

export async function updateMembershipPeriodNote(input: {
  memberId: string;
  periodId: string;
  note: string;
  actorId?: string;
}) {
  return supabaseRest<
    Array<{
      member_id: string;
      membership_period_id: string;
      admin_note: string | null;
      note_updated_at: string | null;
    }>
  >("rpc/update_membership_period_note", {
    method: "POST",
    body: {
      p_member_id: input.memberId,
      p_period_id: input.periodId,
      p_note: input.note,
      p_actor_id: input.actorId ?? "vip-admin",
    },
  });
}

export async function changeMembershipExpiry(input: {
  memberId: string;
  periodId: string;
  expectedExpiry: string;
  newExpiry: string;
  reason: string;
  pastAcknowledged: boolean;
  actorId?: string;
}) {
  return supabaseRest<MembershipActionResult[]>("rpc/admin_change_membership_expiry", {
    method: "POST",
    body: {
      p_member_id: input.memberId,
      p_period_id: input.periodId,
      p_expected_expiry: input.expectedExpiry,
      p_new_expiry: input.newExpiry,
      p_reason: input.reason,
      p_past_acknowledged: input.pastAcknowledged,
      p_actor_id: input.actorId ?? "vip-admin",
    },
  });
}

export async function addMembershipTime(input: {
  memberId: string;
  periodId: string;
  expectedExpiry: string;
  value: number;
  unit: DurationUnit;
  reason: string;
  actorId?: string;
}) {
  return supabaseRest<MembershipActionResult[]>("rpc/admin_add_membership_time", {
    method: "POST",
    body: {
      p_member_id: input.memberId,
      p_period_id: input.periodId,
      p_expected_expiry: input.expectedExpiry,
      p_duration_value: input.value,
      p_duration_unit: input.unit,
      p_reason: input.reason,
      p_actor_id: input.actorId ?? "vip-admin",
    },
  });
}

export async function renewActiveMembership(input: {
  memberId: string;
  periodId: string;
  expectedExpiry: string;
  value: number;
  unit: DurationUnit;
  amount: number;
  currency: string;
  paymentDate: string;
  txHash: string | null;
  paymentNote: string | null;
  reason: string;
  actorId?: string;
}) {
  return supabaseRest<MembershipActionResult[]>("rpc/admin_renew_active_membership", {
    method: "POST",
    body: {
      p_member_id: input.memberId,
      p_period_id: input.periodId,
      p_expected_expiry: input.expectedExpiry,
      p_duration_value: input.value,
      p_duration_unit: input.unit,
      p_amount: input.amount,
      p_currency: input.currency,
      p_payment_date: input.paymentDate,
      p_tx_hash: input.txHash,
      p_payment_note: input.paymentNote,
      p_reason: input.reason,
      p_actor_id: input.actorId ?? "vip-admin",
    },
  });
}

export async function reactivateMembership(input: {
  memberId: string;
  expectedLatestPeriodId: string | null;
  expectedLatestExpiry: string | null;
  reactivationStart: string;
  value: number;
  unit: DurationUnit;
  amount: number;
  currency: string;
  paymentDate: string;
  txHash: string | null;
  paymentNote: string | null;
  reason: string;
  actorId?: string;
}) {
  return supabaseRest<MembershipActionResult[]>("rpc/admin_reactivate_membership", {
    method: "POST",
    body: {
      p_member_id: input.memberId,
      p_expected_latest_period_id: input.expectedLatestPeriodId,
      p_expected_latest_expiry: input.expectedLatestExpiry,
      p_reactivation_start: input.reactivationStart,
      p_duration_value: input.value,
      p_duration_unit: input.unit,
      p_amount: input.amount,
      p_currency: input.currency,
      p_payment_date: input.paymentDate,
      p_tx_hash: input.txHash,
      p_payment_note: input.paymentNote,
      p_reason: input.reason,
      p_actor_id: input.actorId ?? "vip-admin",
    },
  });
}


export async function updateMemberDetails(input: {
  memberId: string;
  expected: Record<string, unknown>;
  proposed: Record<string, unknown>;
  reason: string | null;
  actorId?: string;
}) {
  return supabaseRest<Array<{ member_id: string; event_id: string }>>(
    "rpc/admin_update_member_details",
    {
      method: "POST",
      body: {
        p_member_id: input.memberId,
        p_expected: input.expected,
        p_proposed: input.proposed,
        p_reason: input.reason,
        p_actor_id: input.actorId ?? "vip-admin",
      },
    }
  );
}

export async function updateTelegramUsername(input: {
  memberId: string;
  telegramAccountId: string | null;
  expectedUsername: string | null;
  newUsername: string | null;
  reason: string | null;
  actorId?: string;
}) {
  return supabaseRest<Array<{ telegram_account_id: string; event_id: string }>>(
    "rpc/admin_update_telegram_username",
    {
      method: "POST",
      body: {
        p_member_id: input.memberId,
        p_telegram_account_id: input.telegramAccountId,
        p_expected_username: input.expectedUsername,
        p_new_username: input.newUsername,
        p_reason: input.reason,
        p_actor_id: input.actorId ?? "vip-admin",
      },
    }
  );
}

export async function correctMembershipPeriod(input: {
  memberId: string;
  periodId: string;
  expected: Record<string, unknown>;
  proposed: Record<string, unknown>;
  reason: string;
  actorId?: string;
}) {
  return supabaseRest<Array<{ membership_period_id: string; event_id: string }>>(
    "rpc/admin_correct_membership_period",
    {
      method: "POST",
      body: {
        p_member_id: input.memberId,
        p_period_id: input.periodId,
        p_expected: input.expected,
        p_proposed: input.proposed,
        p_reason: input.reason,
        p_actor_id: input.actorId ?? "vip-admin",
      },
    }
  );
}

export async function correctPayment(input: {
  memberId: string;
  paymentId: string;
  expected: Record<string, unknown>;
  proposed: Record<string, unknown>;
  reason: string;
  actorId?: string;
}) {
  return supabaseRest<Array<{ payment_id: string; event_id: string }>>(
    "rpc/admin_correct_payment",
    {
      method: "POST",
      body: {
        p_member_id: input.memberId,
        p_payment_id: input.paymentId,
        p_expected: input.expected,
        p_proposed: input.proposed,
        p_reason: input.reason,
        p_actor_id: input.actorId ?? "vip-admin",
      },
    }
  );
}

export async function openReviewCase(input: {
  memberId: string;
  membershipPeriodId: string | null;
  paymentId: string | null;
  category: string;
  reason: string;
  actorId?: string;
}) {
  return supabaseRest<Array<{ review_case_id: string; review_status: string }>>(
    "rpc/admin_open_member_review_case",
    {
      method: "POST",
      body: {
        p_member_id: input.memberId,
        p_membership_period_id: input.membershipPeriodId,
        p_payment_id: input.paymentId,
        p_category: input.category,
        p_reason: input.reason,
        p_actor_id: input.actorId ?? "vip-admin",
      },
    }
  );
}

export async function resolveReviewCase(input: {
  caseId: string;
  memberId: string;
  outcome: string;
  note: string;
  actorId?: string;
}) {
  return supabaseRest<
    Array<{ review_case_id: string; review_status: string; membership_period_id: string | null }>
  >("rpc/admin_resolve_member_review_case", {
    method: "POST",
    body: {
      p_case_id: input.caseId,
      p_member_id: input.memberId,
      p_resolution_outcome: input.outcome,
      p_resolution_note: input.note,
      p_actor_id: input.actorId ?? "vip-admin",
    },
  });
}
