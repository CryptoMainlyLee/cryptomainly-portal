import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../app/admin/vip/page.tsx", import.meta.url),
  "utf8"
);

test("quick actions keep Add Member first and Clear filters last", () => {
  const addMember = source.indexOf('href="/admin/vip/new"');
  const clearFilters = source.indexOf('href="/admin/vip"');
  const activeOnly = source.indexOf('href="/admin/vip?status=ACTIVE"');
  const reviewQueue = source.indexOf('href="/admin/vip?review=1"');

  assert.ok(addMember >= 0 && clearFilters >= 0 && activeOnly >= 0 && reviewQueue >= 0);
  assert.ok(addMember < activeOnly);
  assert.ok(activeOnly < reviewQueue);
  assert.ok(reviewQueue < clearFilters);
});

test("Review queue uses open Review cases rather than migration flags", () => {
  assert.match(source, /review === "1" && member\.open_review_count === 0/);
  assert.match(source, /"Open Reviews"/);
  assert.match(source, /open_review_count/);
  assert.match(source, /review_categories/);
  assert.match(source, /review_reason/);
  assert.doesNotMatch(source, /review === "1" && !member\.migration_review/);
});

test("Review row can show one member with multiple open cases", () => {
  assert.match(source, /\+\{member\.open_review_count - 1\} more/);
  assert.match(source, /filtered\.map\(\(member\) =>/);
  assert.match(source, /key=\{member\.member_id\}/);
});

test("Review rows show the earliest open date", () => {
  assert.match(source, /member\.review_opened_at/);
  assert.match(source, /Opened /);
});


test("Blocked is an additive dashboard filter and count, independent of membership status", () => {
  assert.match(source, /blocked\?: string/);
  assert.match(source, /const blocked = params\?\.blocked/);
  assert.match(source, /blocked === "1" && !member\.is_blocked/);
  assert.match(source, /const active = members\.filter\(\(m\) => m\.status === "ACTIVE"\)\.length/);
  assert.match(source, /members\.filter\(\(m\) => m\.is_blocked\)\.length/);
  assert.match(source, /\["Blocked", blockedCount,/);
  assert.match(source, /member\.status/);
  assert.match(source, />BLOCKED</);
});

test("Blocked rows surface outstanding safeguarding work", () => {
  assert.match(source, /member\.telegram_removal_required/);
  assert.match(source, /Telegram removal required/);
  assert.match(source, /member\.effective_access_restoration_required/);
  assert.match(source, /Access restoration required/);
});

test("quick actions order Blocked before Clear filters", () => {
  const addMember = source.indexOf('href="/admin/vip/new"');
  const activeOnly = source.indexOf('href="/admin/vip?status=ACTIVE"');
  const reviewQueue = source.indexOf('href="/admin/vip?review=1"');
  const blocked = source.indexOf('href="/admin/vip?blocked=1"');
  const clearFilters = source.indexOf('href="/admin/vip"');
  assert.ok(addMember < activeOnly && activeOnly < reviewQueue && reviewQueue < blocked && blocked < clearFilters);
});


test("dashboard uses correct Unicode punctuation and no known mojibake", () => {
  assert.match(source, /return "—"/);
  assert.match(source, /View →/);
  assert.doesNotMatch(source, /â€”|â†’|â€¢|â€¦/);
});
