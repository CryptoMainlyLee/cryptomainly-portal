import assert from "node:assert/strict";

const res = await fetch("http://localhost:3101");
assert.equal(res.status, 200, `expected homepage 200, got ${res.status}`);
const html = await res.text();

assert.match(html, /fixed right-6 top-6[^\"]*w-\[340px\]/, "price widget should remain pinned top-right");
assert.match(html, /max-h-\[calc\(100vh-3rem\)\]/, "desktop right widgets should stay within short viewports");
assert.match(html, /overflow-y-auto/, "desktop right widgets should scroll safely if individually too tall");
console.log("PASS price widget remains pinned top-right with short-screen safeguard");