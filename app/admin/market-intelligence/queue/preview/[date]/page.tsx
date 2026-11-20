import Link from "next/link";
import type {Metadata} from "next";
import {session} from "../../../../../_mi/auth";
import {editionDraft,readQueue,type QueueItem} from "../../../../../_mi/review-queue";
export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata:Metadata={title:"Private Edition Preview | CryptoMainly",robots:{index:false,follow:false,nocache:true}};
const panel="rounded-xl border border-slate-700 bg-slate-900/80 p-5";
function VipDraft({item}:{item:QueueItem}){
 const copy="CryptoMainly VIP · Market Intelligence\n\n"+item.title+"\n\n"+item.summary+"\n\nWhy it matters: "+item.why_it_matters+"\n\nImportant limitations: "+item.limitations+"\n\nOriginal analysis: "+item.url+"\n\nResearch and education only; not a trade instruction.";
 return <section className={panel+" space-y-2"}><h3 className="font-semibold">Suggested individual VIP highlight (not sent)</h3><p className="text-xs text-slate-300">Editable draft text, provided for review and lawful attribution. No third-party image is copied or redistributed.</p><textarea className="h-64 w-full rounded border border-slate-600 bg-slate-950 p-3 text-sm text-white" value={copy} readOnly aria-label={"VIP draft for "+item.title}/><p className="text-xs text-amber-200">This is a copy-ready draft only. Automatic sending is not enabled.</p></section>;
}
export default async function Page({params}:{params:{date:string}}){
 const token=await session();
 if(!token)return <main className="min-h-screen bg-[#07111f] p-8 text-slate-100"><h1 className="text-2xl">Private edition preview</h1><p>Administrator login required. No research data is disclosed.</p><Link href="/admin/market-intelligence" className="text-sky-300 underline">Administrator login</Link></main>;
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(params.date))return <main className="min-h-screen bg-[#07111f] p-8 text-slate-100">Invalid edition date.</main>;
 let approved:QueueItem[];
 try{const snapshot=await readQueue();approved=editionDraft(snapshot.state,params.date,snapshot.source)}catch{return <main className="min-h-screen bg-[#07111f] p-8 text-slate-100"><h1>Private queue unavailable</h1><p>Preview blocked until the source and editorial storage can be verified.</p></main>}
 const technical=approved.filter(x=>x.kind==="technical"),data=approved.filter(x=>x.kind==="data");
 return <main className="min-h-screen bg-[#07111f] px-4 py-10 text-slate-100"><div className="mx-auto max-w-5xl space-y-5">
  <div className={panel+" space-y-2"}><p className="text-xs uppercase tracking-wider text-amber-300">CryptoMainly · Protected administrator-only edition mock-up</p><h1 className="text-3xl font-bold">{params.date} Market Intelligence</h1><p className="text-sm text-slate-300">Research preview for editorial assessment. No public edition, media upload, scheduled publish, Telegram message or membership action has occurred.</p><p>{technical.length} technical chart analyses · {data.length} on-chain / quantitative insights · {approved.length} total observations</p><Link href="/admin/market-intelligence/queue" className="inline-block text-sm text-sky-300 underline">Return to research queue</Link></div>
  {approved.length===0&&<section className={panel}><p>No currently valid review-approved observations. Future/stale or removed-source items are excluded. Nothing is published.</p></section>}
  {(["technical","data"] as const).map(kind=>{
   const items=kind==="technical"?technical:data;
   if(!items.length)return null;
   return <section key={kind} className="space-y-3"><h2 className="text-xl font-semibold">{kind==="technical"?"Price chart research":"On-chain and quantitative market intelligence"}</h2>{items.map((item)=><article key={item.id} className={panel+" space-y-2"}>
    <p className="text-xs text-amber-200">@{item.source_handle} · {item.published_at_utc} · {item.score}/100 editorial quality</p>
    <h3 className="text-lg font-semibold">{item.title}</h3>
    <p>{item.summary}</p><p className="text-sm"><strong>Why it matters:</strong> {item.why_it_matters}</p><p className="text-sm text-slate-300"><strong>Limitations:</strong> {item.limitations}</p>
    <a href={item.url} className="inline-block break-all text-sm text-sky-300 underline" rel="noopener noreferrer" target="_blank">View original first-party research and visuals</a><p className="text-xs text-slate-400">Original third-party chart content is not stored or reproduced in this preview.</p>
   </article>)}</section>
  })}
  {approved.some(x=>x.vip_highlight)&&<section className="space-y-3"><h2 className="text-xl font-semibold">Optional VIP highlight drafts</h2>{approved.filter(x=>x.vip_highlight).map(x=><VipDraft key={x.id} item={x}/>)}</section>}
  <section className={panel}><strong>Release safeguard</strong><p className="mt-2 text-sm text-slate-300">Editorial approval here is for internal review only. Live release requires a separately tested edition-publishing system, final copyright/compliance checks and your explicit publication approval.</p></section>
 </div></main>
}
