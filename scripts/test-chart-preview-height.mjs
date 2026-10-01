import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const res = await fetch("http://localhost:3101", { cache: "no-store" });
assert.equal(res.status, 200, `expected 200, got ${res.status}`);
const html = await res.text();
assert.match(html, /md:min-h-\[120px\]/, "desktop chart preview should be about 25% taller");

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
assert.match(source, /className="w-full h-auto block"/, "real chart images must retain natural aspect ratio");
console.log("PASS taller desktop chart preview with proportional chart image");
