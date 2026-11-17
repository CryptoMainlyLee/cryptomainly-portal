"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,".."),seed=JSON.parse(fs.readFileSync(path.join(root,"app/_mi/seed-registry.json"),"utf8"));
const clone=x=>JSON.parse(JSON.stringify(x));
let body=JSON.stringify(seed),http=200,fetchFail=false,bookId="1KR9PPHN9faTrevjjVuIIcXegiA5uMx04knAJNi1hUmE",title="Machine-readable registry envelope — private test; do not edit",snapshot=null,writes=0,fetches=0,locked=true,releases=0,triggers=[],created=0,checks=0;
const goodUrl="https://raw.githubusercontent.com/CryptoMainlyLee/cryptomainly-portal/cryptomainly-source-registry/source-registry.json";
const ctx={console,Date,Utilities:{DigestAlgorithm:{SHA_256:"sha256"},Charset:{UTF_8:"utf8"},computeDigest:(alg,s,charset)=>Array.from(crypto.createHash(alg).update(s,charset).digest())},SpreadsheetApp:{getActiveSpreadsheet:()=>({getId:()=>bookId,getSheetByName:n=>n==="Registry"?{getRange:a=>a==="A1"?{getValue:()=>title}:{setValue:s=>{snapshot=JSON.parse(s);writes++}}}:null}),flush:()=>{}},LockService:{getScriptLock:()=>({tryLock:()=>locked,releaseLock:()=>releases++})},UrlFetchApp:{fetch:(url,opt)=>{fetches++;assert.equal(url,goodUrl);assert.equal(opt.followRedirects,false);assert.equal(opt.validateHttpsCertificates,true);if(fetchFail)throw Error("network");return {getResponseCode:()=>http,getContentText:()=>body}}},ScriptApp:{getProjectTriggers:()=>triggers,newTrigger:name=>({timeBased:()=>({everyMinutes:n=>({create:()=>{assert.equal(n,15);triggers.push({getHandlerFunction:()=>name});created++}})})}),deleteTrigger:t=>{triggers=triggers.filter(x=>x!==t)}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,"mi-registry-bridge-v123.gs"),"utf8"),ctx);
function check(label,f){f();checks++;console.log("PASS",label)}
function change(fn){const x=clone(seed);fn(x);body=JSON.stringify(x)}
function errorSnapshot(){assert.throws(()=>ctx.refreshRegistryBridge());assert.equal(snapshot.status,"error");assert.equal(snapshot.registry,null)}
check("canonical original roster digest",()=>{assert.equal(ctx.refreshRegistryBridge(),seed.revision_sha256);assert.equal(snapshot.mode,"TEST_ONLY");assert.equal(snapshot.registry.source_count,14);assert.equal(snapshot.status,"ok")});
check("only source metadata exported",()=>{change(x=>{x.editorial_audit=[{secret:"not copied"}];x.accounts[0].unrelated="not copied"});ctx.refreshRegistryBridge();assert.equal(snapshot.registry.editorial_audit,undefined);assert.equal(snapshot.registry.accounts[0].unrelated,undefined)});
check("tampered revision rejected",()=>{change(x=>x.revision_sha256="0".repeat(64));errorSnapshot()});
check("case insensitive duplicate rejected",()=>{change(x=>x.accounts[1].handle=x.accounts[0].handle.toLowerCase());errorSnapshot()});
check("invalid priority rejected",()=>{change(x=>x.daily_primary_accounts.monday.primary_accounts.push("missing"));errorSnapshot()});
check("bad schedule rejected",()=>{change(x=>x.daily_primary_accounts.monday.uk_time="11:00");errorSnapshot()});
check("future source time rejected",()=>{change(x=>x.updated_at_utc="2100-01-01T00:00:00Z");errorSnapshot()});
check("redirect refused",()=>{http=302;errorSnapshot();http=200});
check("network error not stale success",()=>{fetchFail=true;errorSnapshot();fetchFail=false});
check("malformed response blocked",()=>{body="not JSON";errorSnapshot()});
check("oversized response blocked",()=>{body="X".repeat(60001);errorSnapshot()});
check("wrong container no fetch or write",()=>{const f=fetches,w=writes;bookId="other";assert.throws(()=>ctx.refreshRegistryBridge());assert.equal(fetches,f);assert.equal(writes,w);bookId="1KR9PPHN9faTrevjjVuIIcXegiA5uMx04knAJNi1hUmE"});
check("lock prevents concurrent fetch",()=>{const f=fetches;locked=false;assert.throws(()=>ctx.refreshRegistryBridge());assert.equal(fetches,f);locked=true});
check("failed install creates no trigger",()=>{http=500;assert.throws(()=>ctx.installRegistryBridge());assert.equal(created,0);http=200});
check("successful install is idempotent",()=>{body=JSON.stringify(seed);ctx.installRegistryBridge();ctx.installRegistryBridge();assert.equal(created,1);assert.equal(triggers.length,1)});
check("stop removes only bridge trigger",()=>{triggers.push({getHandlerFunction:()=>"unrelated"});ctx.stopRegistryBridge();assert.equal(triggers.length,1);assert.equal(triggers[0].getHandlerFunction(),"unrelated")});
console.log("BRIDGE_MOCK_TESTS_PASSED",checks);
