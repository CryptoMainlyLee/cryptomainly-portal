import assert from "node:assert/strict";

const res = await fetch("http://localhost:3101");
assert.equal(res.status, 200, `expected 200, got ${res.status}`);
const html = await res.text();

assert.match(html, /OI-Wtd Funding/, "funding label should state that it is OI-weighted");
assert.match(
  html,
  /Data provided by[\s\S]{0,500}text-\[#60A5FA\][\s\S]{0,200}CoinGecko/,
  "CoinGecko footer link should use the same blue live-link treatment"
);
console.log("PASS OI-Wtd funding label and blue CoinGecko footer link");