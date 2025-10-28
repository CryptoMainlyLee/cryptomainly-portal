import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type FngPayload = {
  ok: boolean;
  stale: boolean;
  value: number | null;
  label: string;
  ts: number;
  error?: string;
};

const SOURCE = "https://api.alternative.me/fng/?limit=1";
const S_MAXAGE = 90;
const TTL_MS = 90_000;
const TIMEOUT_MS = 10_000;

let cache: Omit<FngPayload, "ok" | "stale"> | null = null;
let cacheTs = 0;

function timeout<T>(ms: number, p: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function fetchWithRetry(url: string, tries = 3): Promise<any> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await timeout(TIMEOUT_MS, fetch(url, { cache: "no-store", headers: { "User-Agent": "CryptoMainly/1.0" } }));
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      const delay = (i === 0 ? 300 : i === 1 ? 900 : 1800) + Math.floor(Math.random() * 200);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function GET() {
  const now = Date.now();
  const headers = { "Cache-Control": `public, s-maxage=${S_MAXAGE}, max-age=0, stale-while-revalidate=60` };

  const freshNeeded = now - cacheTs > TTL_MS;
  if (!freshNeeded && cache) {
    return NextResponse.json<FngPayload>({ ok: true, stale: false, ...cache }, { headers });
  }

  try {
    const j = await fetchWithRetry(SOURCE);
    const row = j?.data?.[0];
    const payload = {
      value: row ? Number(row.value) : null,
      label: row?.value_classification || row?.classification || "",
      ts: now,
    };
    cache = payload;
    cacheTs = now;
    return NextResponse.json<FngPayload>({ ok: true, stale: false, ...payload }, { headers });
  } catch (e: any) {
    if (cache) {
      return NextResponse.json<FngPayload>({ ok: true, stale: true, ...cache, error: String(e?.message || e) }, { headers });
    }
    return NextResponse.json<FngPayload>(
      { ok: false, stale: true, value: null, label: "", ts: now, error: String(e?.message || e) },
      { headers }
    );
  }
}
