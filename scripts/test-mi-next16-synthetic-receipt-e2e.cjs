"use strict";
// Entirely local HTTP test: a Node preload mocks the exact EU2 Make webhook.
// NO request reaches Make.com, Telegram, GitHub API or live membership services.
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto"),{execFileSync,spawn}=require("node:child_process");
const root=path.resolve(__dirname,".."),dir=fs.mkdtempSync(path.join(os.tmpdir(),"cm-v135-next16-receipt-"));
const repo="C:/Users/leeln/CryptoMainly_LocalWork/mi-hosted-web-e2e-sandbox-2026-11-21",sha="b9742a9c730acf7580371a54c6fe828b3dbcd955";
const sourceFile=path.join(dir,"source.json"),queueFile=path.join(dir,"queue.json"),capture=path.join(dir,"make-calls.jsonl"),shim=path.join(dir,"mock-make.cjs");
const id="0200d4cc-6aa7-4b3f-abb5-a1ba52195667",chat="-1004432697280";
for(const [file,out] of [["source-registry.json",sourceFile],["editorial-queue-v1.json",queueFile]]){
 fs.writeFileSync(out,execFileSync("git",["-C",repo,"show",sha+":"+file],{encoding:"utf8"}));
}
const before=JSON.parse(fs.readFileSync(queueFile,"utf8"));
assert.equal(before.items.length,6);
assert.equal(before.items.filter(x=>x.vip_delivery?.status==="sent").length,1);
assert.equal(before.items.filter(x=>x.vip_delivery?.status==="unknown").length,2);
assert.ok(before.items.some(x=>x.id===id&&!x.vip_delivery));
const makeShim=`
"use strict";
const fs=require("node:fs");
const original=globalThis.fetch;
globalThis.fetch=async function(input,opts){
 const target=typeof input==="string"?input:input?.url?.toString()||"";
 if(!target.startsWith("https://hook.eu2.make.com/"))return original(input,opts);
 const payload=JSON.parse(String(opts.body));
 if(opts.method!=="POST"||payload.schema!=="cryptomainly-vip-delivery-v1"||payload.destination!=="TEST_ONLY"||payload.approved!==true||!payload.summary.includes("TEST ONLY"))throw Error("Mock refused unexpected Make payload");
 fs.appendFileSync(process.env.CM_TEST_MAKE_CAPTURE,JSON.stringify({request_id:payload.delivery_id,destination:payload.destination,edition_id:payload.edition_id})+"\\n");
 return new Response(JSON.stringify({schema:"cryptomainly-make-delivery-receipt-v1",status:"sent",delivery_id:payload.delivery_id,destination:"TEST_ONLY",chat_id:"-1004432697280",message_id:909}),{status:200,headers:{"Content-Type":"application/json"}});
};`;
fs.writeFileSync(shim,makeShim);
const port=3197,url="http://127.0.0.1:"+port,password=crypto.randomBytes(32).toString("base64url");
const env={...process.env,NODE_ENV:"production",CM_ADMIN_PASSWORD:password,MI_EDITORIAL_MODE:"local",MI_EDITORIAL_TEST_FILE:sourceFile,MI_EDITORIAL_TEST_QUEUE_FILE:queueFile,MI_MAKE_LOCAL_QA:"true",MI_MAKE_TEST_ENABLED:"true",MI_MAKE_DESTINATION:"TEST_ONLY",MI_MAKE_HOSTED_QA:"false",MI_MAKE_WEBHOOK_URL:"https://hook.eu2.make.com/"+"Q".repeat(40),MI_MAKE_WEBHOOK_API_KEY:"Z".repeat(48),CM_TEST_MAKE_CAPTURE:capture,NODE_OPTIONS:"--require "+shim};
for(const key of ["VERCEL","VERCEL_ENV","MI_EDITORIAL_GITHUB_TOKEN","SUPABASE_SERVICE_ROLE_KEY","TELEGRAM_MEMBERSHIP_BOT_TOKEN","MI_VIP_CHAT_ID"])delete env[key];
const server=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","-p",String(port),"-H","127.0.0.1"],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
let serverOutput="";server.stdout.on("data",b=>serverOutput+=b);server.stderr.on("data",b=>serverOutput+=b);
const wait=ms=>new Promise(r=>setTimeout(r,ms)),get=(p,c)=>fetch(url+p,{redirect:"manual",headers:c?{Cookie:c}:{}}),post=(p,o,c)=>fetch(url+p,{method:"POST",redirect:"manual",headers:{Origin:url,"Content-Type":"application/x-www-form-urlencoded",...(c?{Cookie:c}:{})},body:new URLSearchParams(o)});
const find=(html,name)=>{const m=html.match(new RegExp('name="'+name+'" value="([^"]*)"'));assert.ok(m,"Missing "+name);return m[1]};
let count=0;const check=(ok,label)=>{assert.ok(ok,label);count++;console.log("PASS",label)};
(async()=>{try{
 let started=false;for(let i=0;i<65;i++){try{if((await get("/admin/market-intelligence")).status===200){started=true;break}}catch{}await wait(250)}check(started,"Isolated Next16 app accepts local test on loopback");
 const login=await post("/admin/market-intelligence/session",{key:password});check(login.status===303,"Synthetic account login succeeded");
 const cookie=(login.headers.get("set-cookie")||"").split(";")[0];check(cookie.startsWith("cm_mi_editor="),"Private editor cookie set");
 const route="/admin/market-intelligence/queue";
 const page=await get(route,cookie),html=await page.text();
 check(page.status===200&&html.includes("Send to TEST Group"),"Private one-click editor available");
 const item=before.items.find(x=>x.id===id),csrf=find(html,"csrf"),version=find(html,"version");
 const text="TEST ONLY - CryptoMainly V1.35 Next.js 16 synthetic Make receipt acceptance. No actual Telegram message is sent. Testing queue reservation, persistence and duplicate refusal.";
 const fields={csrf,version,id,confirm:"yes",kind:item.kind,market:item.market,url:item.url,source_handle:item.source_handle,title:item.title,summary:item.summary,why_it_matters:item.why_it_matters,limitations:item.limitations,published_at_utc:item.published_at_utc,edition_date:item.edition_date,score:String(item.score),vip_post_text:text,vip_image_url:""};
 const send=await post(route+"/send",fields,cookie);
 check(send.status===303&&send.headers.get("location")?.endsWith("vip=sent"),"Verified synthetic Make acknowledgement completed single website send");
 const next=JSON.parse(fs.readFileSync(queueFile,"utf8")),selected=next.items.find(x=>x.id===id);
 check(selected.vip_delivery?.status==="sent"&&selected.vip_delivery.telegram_message_id===909,"Git-style queue sent state persisted only in disposable local copy");
 check(next.items.length===6,"All six private candidate records preserved");
 check(next.items.filter(x=>x.vip_delivery?.status==="unknown").length===2,"Two historical uncertain records remain locked");
 check(next.items.some(x=>x.vip_delivery?.telegram_message_id===9),"Original verified TEST message #9 retained in copy");
 check(next.audit.some(x=>x.action==="vip_send_reserved")&&next.audit.some(x=>x.action==="vip_sent"),"Reservation and verified receipt audit present");
 const calls=()=>fs.existsSync(capture)?fs.readFileSync(capture,"utf8").trim().split("\n").filter(Boolean):[];
 check(calls().length===1,"Exactly one in-process Make stub invocation, zero network requests");
 const again=await get(route,cookie),html2=await again.text();
 const duplicate=await post(route+"/send",{...fields,csrf:find(html2,"csrf"),version:find(html2,"version")},cookie);
 check(duplicate.status===303&&duplicate.headers.get("location")?.endsWith("error=save"),"Replay of already-sent item explicitly rejected");
 check(calls().length===1,"Duplicate did not invoke Make stub twice");
 check(fs.readFileSync(sourceFile,"utf8")===execFileSync("git",["-C",repo,"show",sha+":source-registry.json"],{encoding:"utf8"}),"Source account registry unchanged");
 console.log("NEXT16_MOCKED_RECEIPT_HTTP_E2E_PASS",JSON.stringify({checks:count,sourceCandidates:6,syntheticMakeCalls:1,actualMakeRequests:0,realTelegramMessages:0,realMemberWrites:0,duplicateBlocked:true}));
}catch(e){console.error("NEXT16_MOCKED_RECEIPT_HTTP_E2E_FAILED",e.stack,serverOutput.slice(-1200));process.exitCode=2}finally{server.kill();await wait(400);fs.rmSync(dir,{recursive:true,force:true})}})();
