import assert from "node:assert/strict";

const base = process.env.BASE_URL || "http://127.0.0.1:3101";
const res = await fetch(base, { cache: "no-store" });
assert.equal(res.status, 200, `expected homepage 200, got ${res.status}`);
const html = await res.text();
assert.match(html, /OI-Wtd Funding/);
console.log("PASS OI-Wtd funding widget label present");