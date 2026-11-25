"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto"),ts=require("typescript");
const base=path.resolve(__dirname,"..");
const source=JSON.parse(fs.readFileSync(path.join(base,"app/_mi/seed-registry.json"),"utf8"));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"cm-mi-queue-test-"));
const env={MI_EDITORIAL_MODE:"local",MI_EDITORIAL_TEST_FILE:path.join(temp,"source-registry.json"),MI_EDITORIAL_TEST_QUEUE_FILE:path.join(temp,"queue.json"),NODE_ENV:"production"};
let requests=0;
const targetExports={};
const js=ts.transpileModule(fs.readFileSync(path.join(base,"app/_mi/review-queue.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(js,{exports:targetExports,require(name){if(name==="server-only")return {};if(name==="node:crypto")return crypto;if(name==="node:fs/promises")return require("node:fs/promises");if(name==="./state")return {readState:async()=>({state:source,version:"synthetic",writable:true})};if(name==="./hosted-qa")return {hostedQaStorageBranch:()=>null};throw Error("Unexpected import "+name)},process:{env},Buffer,URL,AbortSignal,Date,structuredClone,fetch(){requests++;throw Error("Network should never be used")},console});
let passed=0;
function ok(x,name){assert.ok(x,name);passed++;console.log("PASS",name)}
function fails(fn,name){assert.throws(fn);passed++;console.log("PASS",name)}
const now=new Date("2026-11-20T19:20:00.000Z");
const input={
 action:"add",id:"",kind:"technical",market:"crypto",
 url:"https://x.com/rektcapital/status/2123466530629259599?utm_source=sample",source_handle:"rektcapital",
 title:"BTC resistance retests at $65,700 and $63,300",
 summary:"Bitcoin weekly and daily charts show price rejected from former support zones around $65,700 and $63,300.",
 why_it_matters:"Whether the upcoming weekly close recovers resistance may help assess market structure.",
 limitations:"This is an evolving weekly candle; no verified position sizing, stop loss, or predictive probability.",
 published_at_utc:"2026-11-19T17:20:47.659Z",edition_date:"2026-11-20",score:"86",
 evidence:[],reason:"Original source and methodology under independent review",confirm:"yes"
};
const flags=["original_source","timestamp","visual_or_data","methodology","rights","uk_review"];
(async()=>{
 const blank=targetExports.emptyQueue();
 ok(targetExports.validateQueue(blank).items.length===0,"Empty schema validates");
 ok(targetExports.sourceIdentity(input.url).url==="https://x.com/rektcapital/status/2123466530629259599","Tracking parameters normalized");
 fails(()=>targetExports.sourceIdentity("http://x.com/rektcapital/status/2123466530629259599"),"HTTP rejected");
 fails(()=>targetExports.sourceIdentity("https://x.com.evil.com/rektcapital/status/2123466530629259599"),"Host spoofing rejected");
 fails(()=>targetExports.sourceIdentity("https://x.com/rektcapital/status/2123466530629259599/../../other"),"Source URL traversal rejected");
 let s=targetExports.updateQueue(blank,input,source,[],now);
 ok(s.items.length===1&&s.items[0].status==="candidate"&&s.items[0].source_handle==="rektcapital","Draft saved without publishing");
 fails(()=>targetExports.updateQueue(s,input,source,[],now),"Duplicate original URL rejected");
 fails(()=>targetExports.updateQueue(s,{...input,action:"approve",id:s.items[0].id},source,[],now),"Unverified draft cannot be approved");
 fails(()=>targetExports.updateQueue(s,{...input,action:"highlight",id:s.items[0].id},source,[],now),"Unapproved highlight denied");
 const id=s.items[0].id;
 const edited=targetExports.updateQueue(s,{...input,action:"edit",id,evidence:flags},source,[],now);
 ok(edited.items[0].status==="candidate"&&Object.values(edited.items[0].evidence).every(Boolean),"Evidence edits reset to candidate");
 const approved=targetExports.updateQueue(edited,{...input,action:"approve",id},source,[],now);
 ok(approved.items[0].status==="approved_for_review","First-party verified approved handle accepted for editorial review");
 ok(targetExports.editionDraft(approved,"2026-11-20",source,now).length===1,"Edition plan groups reviewed items");
 fails(()=>targetExports.updateQueue(blank,input,source,["https://x.com/rektcapital/status/2123466530629259599"],now),"Already-published historical X post cannot be readded");
 ok(targetExports.editionDraft(approved,"2026-11-20",source,new Date("2026-12-30T12:00:00Z")).length===0,"Stale reviewed observations automatically excluded from current edition plan");
 ok(targetExports.editionDraft(approved,"2026-11-20",{accounts:[]},now).length===0,"Removing a source immediately excludes previously approved daily-plan item");
 const highlighted=targetExports.updateQueue(approved,{...input,action:"highlight",id},source,[],now);
 ok(highlighted.items[0].vip_highlight&&!highlighted.items[0].published,"Highlight is nomination, never sent");
 const rejected=targetExports.updateQueue(highlighted,{...input,action:"reject",id},source,[],now);
 ok(rejected.items[0].status==="rejected"&&!rejected.items[0].vip_highlight,"Rejection clears VIP nomination");
 const reopened=targetExports.updateQueue(rejected,{...input,action:"reopen",id},source,[],now);
 ok(reopened.items[0].status==="candidate","Reopen stays private");
 const changed=targetExports.updateQueue(approved,{...input,action:"edit",id,summary:input.summary+" Additional independent review."},source,[],now);
 ok(changed.items[0].status==="candidate","Edits require reapproval");
 fails(()=>targetExports.updateQueue(edited,{...input,action:"approve",id}, {accounts:[]},[],now),"Removed or unauthorized account blocked");
 const old=targetExports.updateQueue(blank,{...input,action:"add",published_at_utc:"2026-09-30T12:00:00.000Z",evidence:flags},source,[],now);
 fails(()=>targetExports.updateQueue(old,{...input,action:"approve",id:old.items[0].id},source,[],now),"Old source beyond 14 days rejected");
 fails(()=>targetExports.updateQueue(blank,{...input,action:"add",published_at_utc:"2026-11-21T12:00:00.000Z"},source,[],now),"Future source timestamp rejected");
 fails(()=>targetExports.updateQueue(blank,{...input,action:"add",source_handle:"OtherAccount"},source,[],now),"X author mismatch rejected");
 const nominee=targetExports.updateQueue(blank,{...input,action:"add",kind:"data",url:"https://research.glassnode.com/the-week-onchain-week-46-2026/",source_handle:"glassnode",evidence:flags},source,[],now);
 fails(()=>targetExports.updateQueue(nominee,{...input,action:"approve",id:nominee.items[0].id},source,[],now),"Unapproved third-party provider cannot advance to release-ready");
 const dayOnly=targetExports.updateQueue(blank,{...input,action:"add",kind:"data",published_at_utc:"2026-11-17",url:"https://research.glassnode.com/the-week-onchain-week-46-2026/",source_handle:"glassnode",evidence:flags},source,[],now);
 ok(dayOnly.items[0].published_at_utc==="2026-11-17","Exact UTC time can remain unknown at candidate stage");
 fails(()=>targetExports.updateQueue(dayOnly,{...input,action:"approve",id:dayOnly.items[0].id}, {accounts:[...source.accounts,{handle:"glassnode"}]},[],now),"Source approved but exact publication UTC missing still blocks approval");
 const wrong=structuredClone(approved);wrong.items[0].summary="Manipulated";
 fails(()=>targetExports.validateQueue(wrong),"Queue revision tampering blocked");
 const a=await targetExports.readQueue();ok(a.version==="missing"&&a.writable,"Local isolated queue starts unseeded");
 await targetExports.writeQueue("missing",s);
 const b=await targetExports.readQueue();ok(b.version!=="missing"&&b.state.items.length===1,"Queue persisted in isolated local file");
 await assert.rejects(()=>targetExports.writeQueue("missing",s));passed++;console.log("PASS", "Stale optimistic version rejected");
 await targetExports.writeQueue(b.version,approved);
 const c=await targetExports.readQueue();ok(c.state.items[0].status==="approved_for_review","Review-approved state persists correctly");
 ok(requests===0,"No external network or Telegram requests");
 fs.rmSync(temp,{recursive:true,force:true});
 console.log("EDITORIAL_REVIEW_QUEUE_LOCAL_TEST_PASS",passed);
})().catch(e=>{console.error("TEST_FAIL",e.stack);process.exitCode=2;fs.rmSync(temp,{recursive:true,force:true})});
