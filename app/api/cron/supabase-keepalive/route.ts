export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ ok: false }, { status: 401 });
}

function unavailable() {
  return Response.json({ ok: false }, { status: 503 });
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return unauthorized();
  }

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return unavailable();
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/members?select=id&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    return response.ok
      ? Response.json({ ok: true })
      : unavailable();
  } catch {
    return unavailable();
  }
}
