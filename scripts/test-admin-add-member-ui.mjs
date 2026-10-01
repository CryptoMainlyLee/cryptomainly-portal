import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const dashboard = readFileSync("app/admin/vip/page.tsx", "utf8");
const detail = readFileSync("app/admin/vip/[memberId]/page.tsx", "utf8");

assert.match(dashboard, /href="\/admin\/vip\/new"/, "dashboard should link to Add Member route");
assert.match(dashboard, />\s*Add Member\s*</, "dashboard should show Add Member quick action");
assert.equal(existsSync("app/admin/vip/new/page.tsx"), true, "new member route should exist");
assert.equal(existsSync("app/admin/vip/new/AddMemberForm.tsx"), true, "AddMemberForm should exist");
assert.doesNotMatch(dashboard, /Phase 2 • read-only/, "dashboard header should not claim read-only mode");
assert.doesNotMatch(dashboard, /Read-only safety mode/, "dashboard footer should not claim read-only mode");
assert.match(detail, /member-created/, "member detail should support a creation success confirmation");

console.log("PASS Add Member admin UI wiring is present");
