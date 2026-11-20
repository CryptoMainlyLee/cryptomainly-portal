import type {Metadata} from "next";
import Link from "next/link";
import {session,csrf} from "../../../_mi/auth";
import {readQueue,editionDraft,type QueueItem,type QueueSnapshot,type Evidence} from "../../../_mi/review-queue";

export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata:Metadata={title:"Research Review Queue | CryptoMainly",robots:{index:false,follow:false,nocache:true}};
const panel="rounded-xl border border-slate-700 bg-slate-900/80 p-5";
const input="w-full rounded-lg border border-slate-600 bg-slate-950 p-2.5 text-white";
const action="rounded-lg border border-amber-400/60 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-40";
const evidenceFields:[keyof Evidence,string][]= [
 ["original_source","Original first-party source viewed"],
 ["timestamp","UTC timestamp verified"],
 ["visual_or_data","Original visual or quantitative evidence inspected"],
 ["methodology","Metrics, timeframe and limitations checked"],
 ["rights","Rights/embedding and attribution reviewed"],
 ["uk_review","UK financial promotion/compliance review"]
];
function Meta({token,version,op,id=""}:{token:string;version:string;op:string;id?:string}){return <><input type="hidden" name="csrf" value={csrf(token)}/><input type="hidden" name="version" value={version}/><input type="hidden" name="action" value={op}/><input type="hidden" name="id" value={id}/></>}
function Fields({item}:{item?:QueueItem}){
 return <div className="space-y-3">
  <div className="grid gap-3 sm:grid-cols-3">
   <label className="text-sm">Type<select className={input} name="kind" defaultValue={item?.kind??"data"}><option value="technical">Technical price chart</option><option value="data">Quantitative / on-chain insight</option></select></label>
   <label className="text-sm">Market<select className={input} name="market" defaultValue={item?.market??"crypto"}><option value="crypto">Crypto</option><option value="stocks">Stocks</option><option value="macro">Macro</option></select></label>
   <label className="text-sm">Quality score (0–100)<input className={input} type="number" name="score" min={0} max={100} required defaultValue={item?.score??0}/></label>
  </div>
  <label className="block text-sm">Original public source URL<input className={input} type="url" name="url" required maxLength={500} defaultValue={item?.url??""} placeholder="https://x.com/Analyst/status/123..."/></label>
  <label className="block text-sm">Original X handle or research provider<input className={input} name="source_handle" maxLength={15} required defaultValue={item?.source_handle??""} placeholder="Barchart"/></label>
  <label className="block text-sm">Editorial headline<input className={input} name="title" minLength={12} maxLength={130} required defaultValue={item?.title??""}/></label>
  <label className="block text-sm">Finding / key figures<textarea className={input} name="summary" minLength={30} maxLength={950} rows={3} required defaultValue={item?.summary??""}/></label>
  <label className="block text-sm">Why it matters<textarea className={input} name="why_it_matters" minLength={20} maxLength={650} rows={2} required defaultValue={item?.why_it_matters??""}/></label>
  <label className="block text-sm">Interpretation limits and uncertainties<textarea className={input} name="limitations" minLength={20} maxLength={650} rows={2} required defaultValue={item?.limitations??""}/></label>
  <div className="grid gap-3 sm:grid-cols-2">
   <label className="block text-sm">Original publication UTC (ISO 8601)<input className={input} name="published_at_utc" type="text" maxLength={24} required defaultValue={item?.published_at_utc??""} placeholder="2026-11-20T16:01:00.000Z"/></label>
   <label className="block text-sm">Proposed edition date (UTC)<input className={input} name="edition_date" type="date" required defaultValue={item?.edition_date??new Date().toISOString().slice(0,10)}/></label>
  </div>
  <fieldset className="space-y-2 rounded-lg border border-slate-700 p-3"><legend className="px-1 text-sm font-semibold">Editorial evidence checklist</legend>
   <p className="text-xs text-slate-400">Tick only what has actually been checked. All six are necessary before an item can be marked review-approved.</p>
   {evidenceFields.map(([name,label])=><label className="flex items-start gap-2 text-sm" key={name}><input name="evidence" type="checkbox" value={name} defaultChecked={!!item?.evidence[name]} className="mt-1"/>{label}</label>)}
  </fieldset>
 </div>
}
function Reason({defaultValue="Editorial review of original-source evidence"}:{defaultValue?:string}){return <label className="block text-sm">Editorial audit reason<input name="reason" className={input} minLength={8} maxLength={200} required defaultValue={defaultValue}/></label>}
function Confirm({text,disabled}:{text:string;disabled:boolean}){return <><label className="flex gap-2 text-xs text-slate-300"><input name="confirm" value="yes" type="checkbox" required disabled={disabled}/>I have reviewed and confirm this internal editorial action.</label><button className={action} disabled={disabled}>{text}</button></>}
function Decision({token,version,item,op,button,disabled}:{token:string;version:string;item:QueueItem;op:string;button:string;disabled:boolean}){return <form method="post" action="/admin/market-intelligence/queue/action" className="space-y-2 rounded-lg border border-slate-700 p-3"><Meta token={token} version={version} op={op} id={item.id}/><Reason defaultValue={op==="approve"?"Original source and quality gates reviewed":"Editorial review decision"}/><Confirm text={button} disabled={disabled}/></form>}
function Preview({snapshot}:{snapshot:QueueSnapshot}){
 const days=[...new Set(snapshot.state.items.map(x=>x.edition_date))].sort().reverse();
 return <section className={panel+" space-y-3"}>
  <h2 className="text-xl font-semibold">Private edition planning</h2>
  <p className="text-sm text-slate-300">Only review-approved observations appear in an edition plan. Plans are <strong>not public website editions</strong>; no Telegram bot or Make scenario is called.</p>
  {days.length===0?<p className="text-sm text-slate-400">No proposed editions yet.</p>:days.map(date=>{
   const items=editionDraft(snapshot.state,date,snapshot.source);
   return <div className="border-t border-slate-700 pt-3" key={date}><h3 className="font-medium">{date} · {items.length} review-approved</h3><Link href={"/admin/market-intelligence/queue/preview/"+date} className="mt-1 inline-block text-sm text-sky-300 underline">Open protected edition preview (no publishing)</Link>
    {items.length===0?<p className="text-xs text-slate-400">No approved observations.</p>:<ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{items.map(x=><li key={x.id}>{x.title} <span className="text-slate-400">({x.kind}{x.vip_highlight?", VIP highlight nominated":""})</span></li>)}</ul>}
   </div>
  })}
 </section>
}
export default async function Page({searchParams}:{searchParams?:{error?:string;saved?:string}}){
 const token=await session();
 if(!token)return <main className="min-h-screen bg-[#07111f] p-8 text-slate-100"><h1 className="mb-3 text-2xl">Editorial review queue</h1><p>Sign in to Market Intelligence administration before reviewing private research.</p><Link href="/admin/market-intelligence" className="text-sky-300 underline">Administrator login</Link></main>;
 let snap:QueueSnapshot;try{snap=await readQueue()}catch{return <main className="min-h-screen bg-[#07111f] p-8 text-slate-100"><h1 className="text-xl">Private editorial queue unavailable</h1><p>Changes are blocked until its separate storage can be verified.</p><Link href="/admin/market-intelligence" className="text-sky-300 underline">Return to administration</Link></main>}
 const count=snap.state.items.filter(i=>i.status==="approved_for_review").length;
 const unpublished=snap.state.items.filter(i=>i.vip_highlight).length;
 const disabled=!snap.writable;
 return <main className="min-h-screen bg-[#07111f] px-4 py-10 text-slate-100"><div className="mx-auto max-w-5xl space-y-6">
  <header><p className="text-xs uppercase tracking-widest text-amber-300">CryptoMainly · Private editorial workflow · Development</p><h1 className="mt-2 text-3xl font-semibold">Research review queue</h1><p className="mt-2 text-sm text-slate-300">Prepare chart and data-insight research for editorial approval. This feature does not publish to the public site or Telegram.</p><Link href="/admin/market-intelligence" className="mt-3 inline-block text-sm text-sky-300 underline">Back to editorial administration</Link></header>
  <section className={panel}><p>{snap.state.items.length} research candidates · {count} review-approved · {unpublished} VIP highlight nominations</p><p className="mt-2 text-xs text-slate-400">Source roster: {snap.source.accounts.length} approved X accounts. Queue version: {snap.version==="missing"?"Not yet created":snap.version}. {disabled?"Read-only environment":""}</p>
   {searchParams?.saved==="1"&&<p role="status" className="mt-2 text-emerald-300">Private editorial change saved; no content published.</p>}
   {searchParams?.error&&<p role="alert" className="mt-2 text-rose-300">{searchParams.error==="stale"?"The queue changed. Please inspect the latest version and try again.":searchParams.error==="confirm"?"Confirm the editorial action before submitting.":"The requested change was not confirmed; check evidence and source approval before retrying."}</p>}
  </section>
  <Preview snapshot={snap}/>
  <details className={panel}><summary className="cursor-pointer font-semibold text-amber-200">Add a private research candidate</summary>
   <form method="post" action="/admin/market-intelligence/queue/action" className="mt-4 space-y-4"><Meta token={token} version={snap.version} op="add"/><fieldset disabled={disabled} className="space-y-4"><Fields/><Reason/><Confirm text="Save as private candidate" disabled={disabled}/></fieldset></form>
  </details>
  <section className="space-y-3"><h2 className="text-xl font-semibold">Research items</h2>{snap.state.items.length===0&&<p className="text-sm text-slate-400">No candidates yet. Nothing has been sent or published.</p>}
   {[...snap.state.items].sort((a,b)=>b.created_at_utc.localeCompare(a.created_at_utc)).map(i=><article key={i.id} className={panel+" space-y-3"}>
    <div><div className="flex flex-wrap gap-3 text-xs text-slate-400"><span>{i.kind==="technical"?"Technical price chart":"Data / on-chain insight"}</span><span>{i.market}</span><span>{i.edition_date}</span><span>{i.score}/100</span><span className={i.status==="approved_for_review"?"text-emerald-300":i.status==="rejected"?"text-rose-300":"text-amber-200"}>{i.status.replaceAll("_"," ")}</span></div><h3 className="mt-2 text-lg font-semibold">{i.title}</h3><p className="mt-1 text-sm text-slate-300">{i.summary}</p><p className="mt-2 text-sm text-slate-300">Why: {i.why_it_matters}</p><p className="mt-1 text-sm text-amber-100">Limitations: {i.limitations}</p><a className="mt-2 inline-block break-all text-sm text-sky-300 underline" href={i.url} target="_blank" rel="noopener noreferrer">Original public research · @{i.source_handle}</a><p className="text-xs text-slate-400">UTC {i.published_at_utc} · Evidence {Object.values(i.evidence).filter(Boolean).length}/6 · {i.vip_highlight?"VIP highlight nominated (not sent)":"No highlight nominated"}</p></div>
    <details className="border-t border-slate-700 pt-3"><summary className="cursor-pointer text-amber-200">Edit details and evidence</summary><form method="post" action="/admin/market-intelligence/queue/action" className="mt-3 space-y-4"><Meta token={token} version={snap.version} op="edit" id={i.id}/><fieldset disabled={disabled} className="space-y-4"><Fields item={i}/><Reason defaultValue="Evidence correction or updated editorial analysis"/><Confirm text="Save edits (return to candidate status)" disabled={disabled}/></fieldset></form></details>
    <div className="grid gap-3 sm:grid-cols-2">
     {i.status==="candidate"&&<Decision item={i} token={token} version={snap.version} op="approve" button="Mark review-approved (NOT publish)" disabled={disabled}/>}
     {i.status!=="rejected"&&<Decision item={i} token={token} version={snap.version} op="reject" button="Reject candidate" disabled={disabled}/>}
     {i.status==="rejected"&&<Decision item={i} token={token} version={snap.version} op="reopen" button="Reopen for review" disabled={disabled}/>}
     {i.status==="approved_for_review"&&<Decision item={i} token={token} version={snap.version} op={i.vip_highlight?"unhighlight":"highlight"} button={i.vip_highlight?"Remove VIP highlight nomination":"Nominate VIP highlight (NOT send)"} disabled={disabled}/>}
    </div>
   </article>)}
  </section>
  <section className={panel}><h2 className="text-lg font-semibold">Audit history</h2><p className="mt-1 text-xs text-slate-400">All operations are internal; no membership data, publication or Telegram actions.</p><ul className="mt-3 space-y-2 text-xs">{[...snap.state.audit].reverse().slice(0,25).map((a,j)=><li className="break-all border-t border-slate-700 pt-2" key={j}>{a.utc} · {a.action} · {a.item_id} · {a.reason}</li>)}</ul></section>
 </div></main>
}
