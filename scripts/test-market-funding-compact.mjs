import assert from "node:assert/strict";

const res = await fetch("http://localhost:3101");
assert.equal(res.status, 200, `expected 200, got ${res.status}`);
const html = await res.text();

assert.doesNotMatch(html, />OI-wtd 8h</, "funding methodology should not take a second visible line");
assert.match(html, /title="Open-interest-weighted 8h-equivalent funding across Binance, Bybit, Bitget and OKX"/);
assert.match(html, /text-\[#60A5FA\]/, "live reference links should use familiar link blue");
console.log("PASS compact funding row and blue live links");
