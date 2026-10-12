import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("Supabase keepalive route is secret-protected and read-only", () => {
  const source = readFileSync(join(root, "app", "api", "cron", "supabase-keepalive", "route.ts"), "utf8");
  assert.match(source, /process\.env\.CRON_SECRET/);
  assert.match(source, /authorization/i);
  assert.match(source, /SUPABASE_URL/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /rest\/v1\/members\?select=id&limit=1/);
  assert.doesNotMatch(source, /console\.(log|error|warn)/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/i);
});

test("Vercel schedules three daily Supabase keepalive checks", () => {
  const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  const jobs = (config.crons ?? []).filter((job: any) => job.path === "/api/cron/supabase-keepalive");
  assert.equal(jobs.length, 3);
  assert.deepEqual(jobs.map((job: any) => job.schedule).sort(), ["10 10 * * *", "10 18 * * *", "10 2 * * *"]);
});
