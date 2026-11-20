"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto"),{spawn}=require("node:child_process");
const root=path.resolve(__dirname,".."),temp=fs.mkdtempSync(path.join(os.tmpdir(),"cm-scanner-v132-")),sourceFile=path.join(temp,"source.json"),queueFile=path.join(temp,"queue.json");
const source=JSON.parse(fs.readFileSync(path.join(root,"app/_mi/seed-registry.json"),"utf8"));
fs.writeFileSync(sourceFile,JSON.stringify(source));
const origin="http://127.0.0.1:3197",password=crypto.randomBytes(24).toString("base64url");
const env={...process.env,MI_EDITORIAL_MODE:"local",MI_EDITORIAL_TEST_FILE:sourceFile,MI_EDITORIAL_TEST_QUEUE_FILE:queueFile,CM_ADMIN_PASSWORD:password,NODE_ENV:"production"};
delete env.VERCEL;delete env.VERCEL_ENV;delete env.MI_EDITORIAL_GITHUB_TOKEN;
const app=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","-p","3197","-H","127.0.0.1"],{cwd:root,env,stdio:["ignore","pipe","pipe"],windowsHide:true});
let logs="",checks=0;app.stdout.on("data",x=>logs+=x);app.stderr.on("data",x=>logs+=x);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function ok(x,label){assert.ok(x,label);checks++;console.log("PASS",label)}
function eq(x,y,label){assert.equal(x,y,label);checks++;console.log("PASS",label)}
async function get(path,cookie){return fetch(origin+path,{redirect:"manual",headers:cookie?{Cookie:cookie}:{}})}
async function post(path,params,cookie,originHeader=origin){return fetch(origin+path,{method:"POST",redirect:"manual",headers:{"Origin":originHeader,"Content-Type":"application/x-www-form-urlencoded",...(cookie?{Cookie:cookie}:{})},body:new URLSearchParams(params)})}
async function logIn(){return post("/admin/market-intelligence/session",{key:password})}
function extract(html,name){const re=new RegExp('name="'+name+'" value="([^"]+)"');const m=html.match(re);assert(m,"Missing "+name);return m[1]}
const report={
 schema:"cryptomainly-scanner-review-intake-v1",scan_id:"TEST_SCAN_20261120_2215",generated_at_utc:new Date().toISOString(),source_registry_revision:source.revision_sha256,
 items:[
 {kind:"technical",market:"crypto",url:"https://x.com/rektcapital/status/2123800040000000123",source_handle:"rektcapital",title:"Synthetic BTC structure test only",summary:"This is an isolated synthetic bitcoin chart example used only to verify the private scanner import.",why_it_matters:"Technical test entry protects the editorial review and verification workflow.",limitations:"Not a real chart post and not a live trade signal. Source verification and rights remain incomplete.",published_at_utc:new Date(Date.now()-3600000).toISOString(),edition_date:new Date().toISOString().slice(0,10),score:88},
 {kind:"data",market:"crypto",url:"https://research.glassnode.com/the-week-onchain-week-46-2026/",source_handle:"glassnode",title:"Glassnode on-chain sample nomination",summary:"Synthetic preview record for the Glassnode article measuring market holder cohort losses.",why_it_matters:"Identifying liquidation and realised-loss data can help inform risk management.",limitations:"Exact UTC publication time and commercial redistribution rights are not verified.",published_at_utc:"2026-11-17",edition_date:new Date().toISOString().slice(0,10),score:85}
 ]};
(async()=>{try{
 let ready=false;for(let i=0;i<60;i++){try{const r=await get("/admin/market-intelligence");if(r.status===200){ready=true;break}}catch{}await wait(250)}
 ok(ready,"Isolated production-style web app booted");
 eq((await get("/admin/market-intelligence/queue")).status,200,"Anonymous research page returns login gate");
 eq((await post("/admin/market-intelligence/queue/import",{})).status,401,"Unauthenticated scanner import blocked");
 const login=await logIn();eq(login.status,303,"Same VIP administrator password signs in");
 const cookie=(login.headers.get("set-cookie")??"").split(";")[0];ok(cookie.startsWith("cm_mi_editor="),"Session cookie present");
 const initial=await get("/admin/market-intelligence/queue",cookie);eq(initial.status,200,"Private research queue loads");
 const html=await initial.text();ok(html.includes("Import scanner research"),"New scan importer visible only to admin");
 const csrf=extract(html,"csrf"),version=extract(html,"version"),body=JSON.stringify(report);
 const forged=await post("/admin/market-intelligence/queue/import",{csrf:"0".repeat(64),version,scan_payload:body},cookie);
 eq(forged.status,403,"CSRF on scanner import denied");
 const originBad=await post("/admin/market-intelligence/queue/import",{csrf,version,scan_payload:body},cookie,"https://attacker.example");
 eq(originBad.status,403,"Foreign origin import denied");
 const fakeApproval=JSON.stringify({...report,items:[{...report.items[0],editor_approved:true}]});
 const bad=await post("/admin/market-intelligence/queue/import",{csrf,version,scan_payload:fakeApproval},cookie);
 ok(bad.headers.get("location")?.endsWith("error=import"),"Unknown approval bit rejected");
 ok(!fs.existsSync(queueFile),"No queue created by invalid input");
 const inserted=await post("/admin/market-intelligence/queue/import",{csrf,version,scan_payload:body},cookie);
 eq(inserted.status,303,"Verified batch submission redirected");
 ok(inserted.headers.get("location")?.includes("imported=2"),"Two research candidates added through actual HTTP route");
 const stored=JSON.parse(fs.readFileSync(queueFile,"utf8"));
 eq(stored.items.length,2,"Two records stored in isolated queue");
 ok(stored.items.every(x=>x.status==="candidate"&&!x.vip_highlight&&Object.values(x.evidence).every(v=>v===false)),"Import never approves, sends, or claims evidence");
 ok(stored.audit.length===2&&stored.audit.every(x=>x.reason.includes(report.scan_id)),"Audit records preserve scan identifier");
 const q=await get("/admin/market-intelligence/queue",cookie);const h=await q.text();
 ok(h.includes(report.items[0].title)&&h.includes(report.items[1].title),"Both imported cards visible to signed-in administrator");
 const storedVersion=extract(h,"version"),token=extract(h,"csrf");
 const replay=await post("/admin/market-intelligence/queue/import",{csrf:token,version:storedVersion,scan_payload:body},cookie);
 ok(replay.headers.get("location")?.includes("imported=0")&&replay.headers.get("location")?.includes("existing=2"),"Identical re-import is safely skipped");
 eq(JSON.parse(fs.readFileSync(queueFile,"utf8")).revision_sha256,stored.revision_sha256,"Duplicate re-import leaves queue unchanged");
 const stale=await post("/admin/market-intelligence/queue/import",{csrf,version,scan_payload:body},cookie);
 ok(stale.headers.get("location")?.endsWith("error=stale"),"Stale editor version rejected");
 const anon=await get("/admin/market-intelligence/queue");
 ok(!(await anon.text()).includes(report.items[0].title),"Anonymous visitor cannot read scanner candidates");
 const preview=await get("/admin/market-intelligence/queue/preview/"+report.items[0].edition_date,cookie);
 ok(!(await preview.text()).includes(report.items[0].title),"No unapproved item in edition release preview");
 eq(source.revision_sha256,JSON.parse(fs.readFileSync(sourceFile,"utf8")).revision_sha256,"Source-account roster unchanged");
 const oversize="z".repeat(35000);
 eq((await post("/admin/market-intelligence/queue/import",{csrf:token,version:storedVersion,scan_payload:oversize},cookie)).status,403,"Oversized scan rejected before parsing");
 console.log("V132_SCANNER_BATCH_HTTP_E2E_PASS",JSON.stringify({checks,imported:2,approved:0,telegram:0,published:0,sourceRosterUnchanged:true}));
 }catch(e){console.error("V132_SCANNER_BATCH_HTTP_E2E_FAIL",e.stack);process.exitCode=2}finally{app.kill();await wait(400);fs.rmSync(temp,{recursive:true,force:true})}
})();
