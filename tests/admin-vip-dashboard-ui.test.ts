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
