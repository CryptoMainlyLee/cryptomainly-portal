"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto"),ts=require("typescript");
const root=path.resolve(__dirname,"..");
const source=JSON.parse(fs.readFileSync(path.join(root,"app/_mi/seed-registry.json"),"utf8"));
function load(relative,extra){
 const out={};
 const js=ts.transpileModule(fs.readFileSync(path.join(root,relative),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const req=n=>{
  if(n==="server-only")return {};
  if(n==="node:crypto")return crypto;
  if(n==="node:fs/promises")return require("node:fs/promises");
  if(n==="./state")return {};
  if(extra&&extra[n])return extra[n];
  throw Error("Unexpected import "+n);
 };
 vm.runInNewContext(js,{exports:out,require:req,process:{env:{}},Buffer,URL,Date,structuredClone,console},{filename:relative});
 return out;
}
const queue=load("app/_mi/review-queue.ts");
const api=load("app/_mi/scanner-import.ts",{"./review-queue":queue});
let n=0;function ok(condition,label){assert.ok(condition,label);n++;console.log("PASS",label)}
function fails(fn,label){assert.throws(fn);n++;console.log("PASS",label)}
const now=new Date("2026-11-20T22:30:00.000Z"),id="SCANNER_RUN_20261120T2215Z";
const entry={kind:"data",market:"stocks",url:"https://x.com/Barchart/status/2123800040000000000",source_handle:"Barchart",title:"Synthetic quantitative market breadth study",summary:"Synthetic first-party data describes a documented difference in stock-sector market participation.",why_it_matters:"Relative sector breadth can provide meaningful context about current investment risk.",limitations:"Synthetic research only; requires original chart review, data licence check and independent methodology confirmation.",published_at_utc:"2026-11-20T18:00:00.000Z",edition_date:"2026-11-20",score:87};
const nominee={...entry,kind:"data",market:"crypto",url:"https://research.glassnode.com/the-week-onchain-week-46-2026/",source_handle:"glassnode",title:"Synthetic Glassnode holder-cost-basis study",published_at_utc:"2026-11-17"};
const batch={schema:"cryptomainly-scanner-review-intake-v1",scan_id:id,generated_at_utc:"2026-11-20T22:15:00.000Z",source_registry_revision:source.revision_sha256,items:[entry,nominee]};
const json=()=>JSON.stringify(batch);
const a=api.decodeScannerBatch(json(),now);ok(a.items.length===2,"Valid mixed-format scanner report decoded");
const start=queue.emptyQueue();
const imported=api.importScannerBatch(start,a,source,[],now);
ok(imported.added===2&&imported.alreadyQueued===0,"Two distinct source candidates imported");
ok(imported.state.items.every(x=>x.status==="candidate"&&!x.vip_highlight&&Object.values(x.evidence).every(v=>v===false)),"Every imported item remains unapproved with no evidence fabricated");
ok(imported.state.items.some(x=>x.source_handle==="glassnode"&&x.published_at_utc==="2026-11-17"),"Day-only external provider retained as unapproved nomination");
ok(imported.state.audit.length===2,"Each addition gets an audited scanner ID");
const replay=api.importScannerBatch(imported.state,a,source,[],now);
ok(!replay.changed&&replay.added===0&&replay.alreadyQueued===2,"Replay is idempotent and preserves existing edits");
ok(replay.state.revision_sha256===imported.state.revision_sha256,"Replay does not change queue revision");
fails(()=>api.decodeScannerBatch(JSON.stringify({...batch,schema:"unsafe"}),now),"Unknown schema rejected");
fails(()=>api.decodeScannerBatch(JSON.stringify({...batch,source_registry_revision:"deadbeef"}),now),"Malformed source revision rejected");
fails(()=>api.importScannerBatch(start,{...batch,source_registry_revision:"0".repeat(64)},source,[],now),"Outdated source revision rejected");
fails(()=>api.decodeScannerBatch(JSON.stringify({...batch,generated_at_utc:"2026-11-14T12:00:00.000Z"}),now),"Stale scanner generation rejected");
fails(()=>api.decodeScannerBatch(JSON.stringify({...batch,generated_at_utc:"2026-11-21T12:00:00.000Z"}),now),"Future scanner generation rejected");
fails(()=>api.decodeScannerBatch(JSON.stringify({...batch,items:[entry,entry]}),now),"Duplicate source inside same report rejected");
fails(()=>api.decodeScannerBatch(JSON.stringify({...batch,items:[{...entry,source_handle:"another_author"}]}),now),"Author/URL mismatch rejected");
fails(()=>api.decodeScannerBatch(JSON.stringify({...batch,items:[{...entry,editor_approved:true}]}),now),"Untrusted approval field rejected");
fails(()=>api.decodeScannerBatch(JSON.stringify({...batch,items:[{...entry,rights:true}]}),now),"Untrusted rights field rejected");
fails(()=>api.decodeScannerBatch(JSON.stringify({...batch,items:[{...entry,url:"https://bad-domain.com/info"}]}),now),"Unapproved external domain rejected");
fails(()=>api.decodeScannerBatch(JSON.stringify({...batch,items:[{...entry,url:"http://x.com/Barchart/status/2123800040000000000"}]}),now),"Non-HTTPS post rejected");
fails(()=>api.decodeScannerBatch(JSON.stringify({...batch,items:[{...entry,published_at_utc:"2026-11-30"}]}),now),"Future original research date rejected");
fails(()=>api.decodeScannerBatch(JSON.stringify({...batch,items:[{...entry,published_at_utc:"2026-10-01"}]}),now),"Stale original research date rejected");
fails(()=>api.decodeScannerBatch(JSON.stringify({...batch,items:Array.from({length:13},(_,i)=>({...entry,url:"https://x.com/Barchart/status/"+String(2123800040000000000n+BigInt(i))}))}),now),"More than twelve candidates rejected");
fails(()=>api.importScannerBatch(start,a,source,[entry.url],now),"Previously published source rejected atomically");
ok(start.items.length===0,"Rejected batch leaves input queue untouched");
console.log("SCANNER_IMPORT_V132_PURE_REGRESSION_PASS",n);
