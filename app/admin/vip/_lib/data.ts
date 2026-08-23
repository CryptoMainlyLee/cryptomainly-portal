import "server-only";

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
    const operation = method === "GET" ? "read" : "write";
    throw new Error(
      `Supabase dashboard ${operation} failed (${response.status}): ${detail}`
    );
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function getMembers() {
  return supabaseRest<MemberOverview[]>(
    "admin_member_overview?select=*&order=status.asc,expires_on.asc.nullslast,display_name.asc"
  );
}

export async function getMember(memberId: string) {
  const rows = await supabaseRest<MemberOverview[]>(
    `admin_member_overview?select=*&member_id=eq.${encodeURIComponent(memberId)}&limit=1`
  );
  return rows[0] ?? null;
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
