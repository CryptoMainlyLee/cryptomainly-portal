import assert from "node:assert/strict";

const base = process.env.BASE_URL || "http://127.0.0.1:3101";
const res = await fetch(`${base}/api/metrics/market-funding`, { cache: "no-store" });
assert.equal(res.status, 200, `expected 200, got ${res.status}`);

const body = await res.json();
assert.equal(body.ok, true);
assert.equal(body.normalizedHours, 8);
assert.ok(Number.isFinite(body.btc?.fundingRate));
assert.ok(Number.isFinite(body.eth?.fundingRate));
assert.ok(Array.isArray(body.btc?.venues));
assert.ok(body.btc.venues.length >= 3);
assert.ok(body.btc.venues.every((v) => Number.isFinite(v.oiUsd) && v.oiUsd > 0));
assert.ok(body.btc.venues.every((v) => Number.isFinite(v.fundingRate8h)));
assert.ok(body.sources?.includes("Binance"));
assert.ok(body.sources?.includes("Bybit"));
assert.ok(body.sources?.includes("Bitget"));
assert.ok(body.sources?.includes("OKX"));

console.log(`PASS market funding: BTC=${(body.btc.fundingRate*100).toFixed(5)}% ETH=${(body.eth.fundingRate*100).toFixed(5)}%`);
