import assert from "node:assert/strict";

const res = await fetch("http://localhost:3101", { cache: "no-store" });
assert.equal(res.status, 200, `expected 200, got ${res.status}`);
const html = await res.text();

assert.match(html, /fixed right-6 top-6[^\"]*w-\[340px\]/, "price widget should be independently pinned top-right");
assert.match(html, /fixed right-6 bottom-6[^\"]*w-\[340px\]/, "email widget should be independently pinned bottom-right");
assert.doesNotMatch(html, /top-6[^\"]*overflow-y-auto[^\"]*space-y-3/, "desktop widgets should not share one scrollable rail");
console.log("PASS desktop price/email widgets use independent top/bottom anchors");