import assert from "node:assert/strict";

const base = process.env.BASE_URL || "http://127.0.0.1:3101";
const res = await fetch(`${base}/api/metrics/market-funding`, { cache: "no-store" });
assert.equal(res.status, 200, `expected 200, got ${res.status}`);

const body = await res.json();
assert.equal(body.ok, true);
assert.equal(body.normalizedHours, 8);
for (const coin of [body.btc, body.eth]) {
  assert.ok(Number.isFinite(coin?.fundingRate));
  assert.ok(Array.isArray(coin?.venues));
  assert.ok(coin.venues.length >= 3, "aggregate requires at least 3 live venues");
  assert.ok(coin.venues.every((v) => Number.isFinite(v.oiUsd) && v.oiUsd > 0));
  assert.ok(coin.venues.every((v) => Number.isFinite(v.fundingRate8h)));
}
assert.ok(body.sources?.includes("Hyperliquid"), "Hyperliquid source missing");
assert.ok(body.sources?.includes("Gate.io"), "Gate.io source missing");

console.log(`PASS market funding: BTC=${(body.btc.fundingRate*100).toFixed(5)}% ETH=${(body.eth.fundingRate*100).toFixed(5)}% sources=${body.sources.join(",")}`);
