"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto"),{spawn}=require("node:child_process");
const root=path.resolve(__dirname,".."),dir=fs.mkdtempSync(path.join(os.tmpdir(),"cm-queue-e2e-")),stateFile=path.join(dir,"registry.json"),queueFile=path.join(dir,"queue.json");
const seed=JSON.parse(fs.readFileSync(path.join(root,"app/_mi/seed-registry.json"),"utf8"));
fs.writeFileSync(stateFile,JSON.stringify({...seed,editorial_visibility:{schema_version:1,hidden_edition_slugs:[],hidden_post_ids_by_edition:{}},editorial_audit:[]}));
const origin="http://127.0.0.1:3197",p="/admin/market-intelligence/queue",password=crypto.randomBytes(24).toString("base64url");
const env={...process.env,NODE_ENV:"production",MI_EDITORIAL_MODE:"local",MI_EDITORIAL_TEST_FILE:stateFile,MI_EDITORIAL_TEST_QUEUE_FILE:queueFile,CM_ADMIN_PASSWORD:password};
delete env.VERCEL;delete env.VERCEL_ENV;delete env.MI_EDITORIAL_GITHUB_TOKEN;
let cookie="",count=0;const wait=ms=>new Promise(r=>setTimeout(r,ms));
const server=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","-p","3197","-H","127.0.0.1"],{cwd:root,env,stdio:["ignore","pipe","pipe"],windowsHide:true});
let log="";server.stdout.on("data",b=>log+=b);server.stderr.on("data",b=>log+=b);
function ok(x,msg){assert.ok(x,msg);console.log("PASS",msg);count++}function eq(a,b,msg){assert.equal(a,b,msg);console.log("PASS",msg);count++}
async function get(route,headers={}){return fetch(origin+route,{redirect:"manual",headers});}
async function post(route,values,headers={}){return fetch(origin+route,{method:"POST",redirect:"manual",headers:{Origin:origin,"Content-Type":"application/x-www-form-urlencoded",...headers},body:(()=>{const q=new URLSearchParams();for(const [k,v] of Object.entries(values)){if(Array.isArray(v)){for(const item of v)q.append(k,item)}else q.append(k,String(v))}return q})()});}
async function page(){const r=await get(p,{Cookie:cookie});eq(r.status,200,"Protected queue responds to authenticated user");const html=await r.text();const find=k=>{const m=html.match(new RegExp('name="'+k+'" value="([^"]*)"'));assert.ok(m,"Missing "+k);return m[1]};return {html,csrf:find("csrf"),version:find("version")}}
async function change(action,fields={}){const s=await page();return post(p+"/action",{csrf:s.csrf,version:s.version,action,reason:"Independent source evidence reviewed",confirm:"yes",...fields},{Cookie:cookie})}
function saved(r,label){ok(r.status===303&&r.headers.get("location").endsWith("?saved=1"),label)}
const input={
 kind:"data",market:"stocks",url:"https://x.com/Barchart/status/2123613914432762273",
 source_handle:"Barchart",title:"Household pressure reaches a historical extreme",
 summary:"An original sourced chart shows household pressure near 150 relative to a 2010–2025 average around 101.",
 why_it_matters:"This may signal a challenging household financial environment rather than a trading entry.",
 limitations:"The chart spans 2010 onward; the highest-in-history claim and index methodology require independent verification.",
 published_at_utc:"2026-11-20T03:06:26.696Z",edition_date:"2026-11-20",score:"84"
};
(async()=>{try{
 let start=false;for(let i=0;i<50;i++){try{if((await get("/admin/market-intelligence")).status===200){start=true;break}}catch{}await wait(250)}ok(start,"Isolated production-style Next.js server started");
 const anonymous=await get(p);const publicHtml=await anonymous.text();ok(!publicHtml.includes("Household pressure reaches")&&!publicHtml.includes("Barchart ·"),"Anonymous private queue shows no drafts");
 eq((await post(p+"/action",{action:"add"})).status,401,"Anonymous writes denied");
 const login=await post("/admin/market-intelligence/session",{key:password});eq(login.status,303,"Shared admin login accepted");cookie=(login.headers.get("set-cookie")||"").split(";")[0];ok(cookie.startsWith("cm_mi_editor="),"Isolated editor cookie established");
 const blank=await page();ok(blank.html.includes("No research candidates yet")&&blank.version==="missing","Empty private queue loads safely");
 eq((await post(p+"/action",{action:"add",csrf:"0".repeat(64),version:"missing",...input,confirm:"yes",reason:"Reviewed secure source"},{Cookie:cookie})).status,403,"Tampered CSRF denied");
 eq((await post(p+"/action",{action:"add",csrf:blank.csrf,version:"missing",...input,confirm:"yes",reason:"Reviewed secure source"},{Cookie:cookie,Origin:"https://wrong.example"})).status,403,"Cross-origin write denied");
 saved(await change("add",input),"First-party candidate added to isolated queue");
 const after=JSON.parse(fs.readFileSync(queueFile,"utf8"));eq(after.items.length,1,"One queue item persisted");eq(after.items[0].status,"candidate","Created item remains a candidate");eq(JSON.parse(fs.readFileSync(stateFile,"utf8")).revision_sha256,seed.revision_sha256,"Account registry unchanged");
 const id=after.items[0].id;
 ok((await (await get(p,{Cookie:cookie})).text()).includes("Household pressure reaches"),"Private queue renders new research");
 const incompleteHtml=await (await get(p,{Cookie:cookie})).text();
 ok(!incompleteHtml.includes("Not ready for review approval")&&incompleteHtml.includes("Edit post and prepare VIP message"),"New VIP editor shows research without a six-check evidence barrier");
 ok(incompleteHtml.includes("Send to TEST Group"),"One-click VIP send wording is present on research card");
 const unauthPreview=await get(p+"/preview/2026-11-20");ok(!(await unauthPreview.text()).includes("Household pressure reaches"),"Anonymous edition preview hides draft data");
 const stale=await post(p+"/action",{action:"reject",id,version:"missing",csrf:blank.csrf,reason:"Review and reject",confirm:"yes"},{Cookie:cookie});ok(stale.headers.get("location").endsWith("?error=stale"),"Stale queue version rejected");
 const dup=await change("add",input);ok(dup.headers.get("location").endsWith("?error=save"),"Same original post cannot be added twice");
 const blocked=await change("approve",{id});ok(blocked.headers.get("location").endsWith("?error=approval"),"Unverified source has a specific approval-blocked message");
 const observed=JSON.parse(fs.readFileSync(queueFile,"utf8"));eq(observed.audit.length,1,"Rejected actions do not add audit history");
 const complete={...input,id,evidence:["original_source","timestamp","visual_or_data","methodology","rights","uk_review"]};
 saved(await change("edit",complete),"Editorial evidence checklist saved");
 const completeHtml=await (await get(p,{Cookie:cookie})).text();
 ok(completeHtml.includes("Send to TEST Group"),"No extra approval UI appears after saving research evidence");
 saved(await change("approve",{id}),"Fully reviewed candidate marked review-approved");
 let approved=JSON.parse(fs.readFileSync(queueFile,"utf8"));eq(approved.items[0].status,"approved_for_review","Review-approved state persisted");
 ok((await (await get(p+"/preview/2026-11-20",{Cookie:cookie})).text()).includes("Household pressure reaches"),"Protected preview shows approved item");
 saved(await change("highlight",{id}),"VIP highlight nomination saved without send");
 const preview=await get(p+"/preview/2026-11-20",{Cookie:cookie});const html=await preview.text();
 ok(html.includes("Suggested individual VIP highlight")&&html.includes("Original analysis:"),"Copy-ready VIP message prepared privately");
 ok(html.includes("Automatic sending is not enabled"),"Preview clearly excludes automatic delivery");
 saved(await change("reject",{id}),"Research item rejected");
 const rejected=JSON.parse(fs.readFileSync(queueFile,"utf8"));ok(rejected.items[0].status==="rejected"&&!rejected.items[0].vip_highlight,"Rejection withdraws highlight nomination");
 ok(!(await (await get(p+"/preview/2026-11-20",{Cookie:cookie})).text()).includes("Household pressure reaches"),"Rejected research excluded from edition plan");
 const history=await change("add",{...input,url:"https://x.com/Barchart/status/2121924373942804666"});ok(history.headers.get("location").endsWith("?error=save"),"Archived 15 November post rejected");
 console.log("QUEUE_AUTHENTICATED_E2E_PASS",JSON.stringify({checks:count,queueItems:rejected.items.length,audits:rejected.audit.length,publicSiteChanged:false,telegramCalls:0,sourceRegistryUnchanged:true}));
}catch(e){console.error("QUEUE_AUTHENTICATED_E2E_FAILED",e.stack);process.exitCode=2}finally{server.kill();await wait(450);fs.rmSync(dir,{recursive:true,force:true})}})();
