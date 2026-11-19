import { readState } from "../../../_mi/state";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Public roster projection from the SAME state the owner edits. No audit,
// moderation details, credentials or membership records are exposed.
const headers = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export async function GET() {
  try {
    const { state, writable } = await readState();
    if (!writable) return Response.json({ status: "unavailable" }, { status: 503, headers });
    const { schema, revision_sha256, updated_at_utc, source_count, accounts, daily_primary_accounts } = state;
    return Response.json({ schema, revision_sha256, updated_at_utc, source_count, accounts, daily_primary_accounts }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
