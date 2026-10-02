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
