import assert from "node:assert/strict";

const res = await fetch("http://localhost:3101");
assert.equal(res.status, 200, `expected homepage 200, got ${res.status}`);
const html = await res.text();

assert.match(html, /fixed right-6 top-6/, "desktop right rail should pin to top-right");
assert.doesNotMatch(html, /fixed right-6 bottom-6/, "desktop right rail should no longer anchor from bottom");
assert.match(html, /max-h-\[calc\(100vh-3rem\)\]/, "right rail should stay within short viewports");
assert.match(html, /overflow-y-auto/, "right rail should scroll safely on short viewports");
console.log("PASS right rail pinned top-right with short-screen overflow safeguard");