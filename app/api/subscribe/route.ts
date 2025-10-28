import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/* ───────── Types ───────── */
type Row = {
  email: string;
  telegram?: string;
  source?: string;
  ip?: string;
  ua?: string;
  ts: number;
};

/* ───────── Config ───────── */
const GOOGLE_SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbw3D1APIZTzuLDC3GtQpEcwp9Sn2PwMi5i_Ljgg-zEWQ2-Un0M_LrDZ--rvS38LFEkr/exec"

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "subscribers.json");

const lastHit = new Map<string, number>();
const RATE_MS = 30_000;

/* ───────── Utils ───────── */
async function ensureFile() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}
  try { await fs.access(DATA_FILE); }
  catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ rows: [] }, null, 2), "utf-8");
  }
}

async function readAll(): Promise<{ rows: Row[] }> {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw || '{"rows": []}');
}

async function writeAll(rows: Row[]) {
  await ensureFile();
  await fs.writeFile(DATA_FILE, JSON.stringify({ rows }, null, 2), "utf-8");
}

async function notifyTelegram(text: string) {
  if (!TG_TOKEN || !TG_CHAT) return;
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text }),
    });
  } catch (err) {
    console.error("Telegram notify failed:", err);
  }
}

function validEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function cleanTelegram(t?: string) {
  if (!t) return "";
  const h = t.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9_]{5,}$/.test(h)) return "";
  return h;
}

/* Abortable fetch with timeout (node 18) */
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 15000) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  try {
    const resp = await fetch(input, { ...init, signal: ac.signal });
    return resp;
  } finally {
    clearTimeout(id);
  }
}

/* ───────── Handler ───────── */
export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0";
  const ua = req.headers.get("user-agent") || "";

  // Rate limit
  const prev = lastHit.get(ip) || 0;
  const now = Date.now();
  if (now - prev < RATE_MS) {
    return NextResponse.json({ ok: false, error: "Too many requests. Please wait a moment." }, { status: 429 });
  }
  lastHit.set(ip, now);

  // Body
  let body: any = {};
  try { body = await req.json(); }
  catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const email = String(body.email || "").trim();
  const telegram = cleanTelegram(body.telegram);
  const source = String(body.source || "landing").slice(0, 64);

  if (!validEmail(email)) {
    return NextResponse.json({ ok: false, error: "Invalid email." }, { status: 400 });
  }

  try {
    // Local save (authoritative)
    const data = await readAll();
    let duplicate = false;
    const existing = data.rows.find(r => r.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      duplicate = true;
      if (telegram && !existing.telegram) {
        existing.telegram = telegram;
        await writeAll(data.rows);
      }
    } else {
      const row: Row = { email, telegram, source, ip, ua, ts: now };
      data.rows.unshift(row);
      await writeAll(data.rows);
    }

    // Notify (optional)
    const tgNote = telegram ? ` (@${telegram})` : "";
    await notifyTelegram(`New subscriber: ${email}${tgNote}${duplicate ? " [duplicate]" : ""}`);

    // ───── Google Sheets sync (JSON first, then form-encoded fallback) ─────
    if (GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL.startsWith("http")) {
      try {
        // Attempt 1: JSON
        const r1 = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, telegram, source, ip }),
        }, 15000);

        const t1 = await r1.text().catch(() => "");
        console.log("Sheets sync #1 (JSON):", r1.status, t1);

        let ok = false;
        try {
          const j1 = JSON.parse(t1);
          ok = r1.ok && j1 && j1.ok === true;
        } catch {
          ok = r1.ok && /ok["']?\s*:\s*true/i.test(t1);
        }

        if (!ok) {
          // Attempt 2: form-encoded (some scripts/plugins expect this)
          const form = new URLSearchParams();
          form.set("email", email);
          form.set("telegram", telegram);
          form.set("source", source);
          form.set("ip", ip);

          const r2 = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form.toString(),
          }, 15000);

          const t2 = await r2.text().catch(() => "");
          console.log("Sheets sync #2 (form):", r2.status, t2);

          if (!r2.ok) {
            console.error("Google Sheets sync failed (both attempts).");
          }
        }
      } catch (err) {
        console.error("Google Sheets sync error:", err);
      }
    } else {
      console.warn("GOOGLE_SCRIPT_URL missing or invalid. Skipping Sheets sync.");
    }

    return NextResponse.json({ ok: true, duplicate });
  } catch (err: any) {
    console.error("Subscribe route error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}
