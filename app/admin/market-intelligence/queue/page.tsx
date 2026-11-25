import type {Metadata} from "next";
import Link from "next/link";
import {session,csrf} from "../../../_mi/auth";
import {readQueue,type QueueItem,type QueueSnapshot} from "../../../_mi/review-queue";
import {composeVipText,vipConfig} from "../../../_mi/vip-outbox";

export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata:Metadata={title:"Research & VIP Publishing | CryptoMainly",robots:{index:false,follow:false,nocache:true}};
const panel="rounded-xl border border-slate-700 bg-slate-900/80 p-5 md:p-6";
const input="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-base text-white focus:border-sky-400";
const sub="block text-sm font-medium text-slate-300";
const button="rounded-lg border border-slate-500 px-4 py-2.5 font-semibold text-slate-100 hover:border-sky-400";
function Hidden({token,version,action,id=""}:{token:string;version:string;action:string;id?:string}){return <><input type="hidden" name="csrf" value={csrf(token)}/><input type="hidden" name="version" value={version}/><input type="hidden" name="action" value={action}/><input type="hidden" name="id" value={id}/></>}
function SourceVisual({item}:{item:QueueItem}){
 const id=item.url.match(/^https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/(\d{14,24})$/)?.[1];
 return <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
  <div className="flex items-center justify-between gap-2 border-b border-slate-700 px-4 py-3 text-sm"><strong>Original research / images</strong><a className="text-sky-300 underline" href={item.url} target="_blank" rel="noopener noreferrer">Open original source</a></div>
  {item.vip_image_url?<img className="mx-auto max-h-[460px] w-full object-contain" src={item.vip_image_url} alt={"Owner-provided illustration for "+item.title} loading="lazy"/>:
   id?<div><iframe title={"Official source preview for "+item.title} src={"https://platform.twitter.com/embed/Tweet.html?id="+id+"&theme=dark"} loading="lazy" className="h-[390px] w-full border-0" sandbox="allow-scripts allow-same-origin allow-popups"/><p className="px-4 pb-3 text-xs text-slate-400">Official embedded X post may show its original charts. If X restricts embedding, use “Open original source.”</p></div>:
   <div className="space-y-3 p-5"><p className="text-slate-200">Open the original provider research to see its charts, infographics and methodology.</p><p className="break-words text-sm text-sky-300">{item.source_handle} · original research article</p><p className="text-xs text-slate-400">Third-party graphics are linked rather than copied into CryptoMainly. An authorised CryptoMainly-hosted image can be added below.</p></div>}
 </div>;
}
function EditFields({item}:{item?:QueueItem}){
 return <div className="space-y-4">
  <div className="grid gap-3 md:grid-cols-3">
   <label className={sub}>Research category<select className={input} name="kind" defaultValue={item?.kind??"data"}><option value="technical">Technical price chart</option><option value="data">On-chain / quantitative insight</option></select></label>
   <label className={sub}>Market<select className={input} name="market" defaultValue={item?.market??"crypto"}><option value="crypto">Crypto</option><option value="stocks">Stocks</option><option value="macro">Macro</option></select></label>
   <label className={sub}>Editorial score<input className={input} name="score" type="number" min={0} max={100} required defaultValue={item?.score??80}/></label>
  </div>
  <label className={sub}>Original source link<input className={input} name="url" type="url" maxLength={500} required defaultValue={item?.url??""}/></label>
  <label className={sub}>Original author / provider<input className={input} name="source_handle" maxLength={15} required defaultValue={item?.source_handle??""}/></label>
  <label className={sub}>Headline<input className={input} name="title" minLength={12} maxLength={130} required defaultValue={item?.title??""}/></label>
  <label className={sub}>Overview / key figures<textarea className={input} name="summary" minLength={30} maxLength={950} rows={3} required defaultValue={item?.summary??""}/></label>
  <label className={sub}>Why this matters<textarea className={input} name="why_it_matters" minLength={20} maxLength={650} rows={2} required defaultValue={item?.why_it_matters??""}/></label>
  <label className={sub}>Context / important limitations<textarea className={input} name="limitations" minLength={20} maxLength={650} rows={2} required defaultValue={item?.limitations??""}/></label>
  <div className="grid gap-3 md:grid-cols-2">
   <label className={sub}>Source publication date / UTC<input className={input} name="published_at_utc" maxLength={24} required defaultValue={item?.published_at_utc??""} placeholder="2026-11-20 or 2026-11-20T16:01:00.000Z"/></label>
   <label className={sub}>Research edition date<input className={input} name="edition_date" type="date" required defaultValue={item?.edition_date??new Date().toISOString().slice(0,10)}/></label>
  </div>
  <label className={sub}>VIP Telegram message (edit freely)<textarea className={input+" font-mono text-sm"} name="vip_post_text" maxLength={2400} rows={8} defaultValue={item?(item.vip_post_text||composeVipText(item).replace("\n\nOriginal source: "+item.url,"")):""} placeholder="Write your individual VIP summary here. The original source link is always appended automatically."/></label>
  <label className={sub}>Optional CryptoMainly-hosted image link (owned or licensed)
   <input className={input} name="vip_image_url" maxLength={500} type="url" defaultValue={item?.vip_image_url??""} placeholder="https://www.cryptomainly.co.uk/assets/market-intelligence/your-chart.png"/>
   <span className="mt-1 block text-xs font-normal text-slate-400">Only images hosted in CryptoMainly’s Market Intelligence assets are accepted. Without an image, Telegram can show a preview of the original source link when supported. Do not upload or repost unlicensed charts.</span>
  </label>
 </div>;
}
function CandidateCard({item,token,version,writable,connected,connectionReason}:{item:QueueItem;token:string;version:string;writable:boolean;connected:boolean;connectionReason:string}){
 const sent=item.vip_delivery?.status==="sent";
 const pending=!!item.vip_delivery&&!sent;
 const locked=sent||pending||item.status==="rejected"||!writable;
 return <article className={panel+" space-y-4"} id={"research-"+item.id}>
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300"><span className="rounded-full border border-slate-600 px-2 py-1">{item.kind==="technical"?"Technical chart":"On-chain / quantitative"}</span><span>{item.market}</span><span>{item.edition_date}</span></div>
   <strong className={sent?"text-emerald-300":pending?"text-amber-200":item.status==="rejected"?"text-rose-300":"text-sky-300"}>{sent?(process.env.MI_MAKE_HOSTED_QA==="true"?"Sent to TEST Group":"Sent to VIP"):pending?"Delivery status needs checking":item.status==="rejected"?"Rejected":"Ready for your review"}</strong>
  </div>
  <h2 className="text-2xl font-semibold leading-snug">{item.title}</h2>
  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
   <div className="space-y-3 text-base leading-relaxed"><p>{item.summary}</p><p><strong>Why it matters:</strong> {item.why_it_matters}</p><p className="text-sm text-amber-100"><strong>Context:</strong> {item.limitations}</p><p className="text-sm text-slate-400">By @{item.source_handle} · {item.published_at_utc}</p></div>
   <SourceVisual item={item}/>
  </div>
  <details className="rounded-lg border border-slate-700 bg-slate-950/40 p-4">
   <summary className="cursor-pointer text-lg font-semibold text-sky-200">Edit post and prepare VIP message</summary>
   <form method="post" action="/admin/market-intelligence/queue/action" className="mt-4 space-y-5">
    <Hidden token={token} version={version} action={item.status==="rejected"?"reopen":"edit"} id={item.id}/>
    <EditFields item={item}/>
    <input type="hidden" name="reason" value="Owner updated editorial draft and individual VIP message"/>
    <label className="flex items-start gap-3 rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm">
     <input type="checkbox" name="confirm" value="yes" required className="mt-1"/>
     <span>I have reviewed this post, its original source and any image-sharing permissions, and confirm this action.</span>
    </label>
    <div className="flex flex-wrap items-center gap-3">
     <button className={button} disabled={!writable||item.status==="rejected"} type="submit">Save edits</button>
     <button type="submit" formAction="/admin/market-intelligence/queue/send" disabled={locked||!connected} className="rounded-lg bg-emerald-500 px-6 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">{sent?"Already sent to TEST Group":pending?"Check delivery before resending":"Send to TEST Group"}</button>
    </div>
    {!connected&&!sent&&<p className="text-sm text-amber-300">{connectionReason} Sending cannot be enabled by ticking the box alone.</p>}
    {sent&&<p className="text-sm text-emerald-300">Telegram confirmed message #{item.vip_delivery?.telegram_message_id}. Editing this record will not modify or resend that Telegram message.</p>}
    {pending&&<p className="text-sm text-amber-300">The outbound attempt was reserved. Do not retry until its Telegram outcome is reconciled.</p>}
    <p className="text-xs text-slate-400">This sends one individual highlight to the private TEST group only. It does not automatically publish a dated Market Intelligence website edition.</p>
   </form>
  </details>
  {item.status==="rejected"&&<p className="text-sm text-rose-300">Rejected research cannot be sent. Reopen it in the legacy editorial controls if needed.</p>}
 </article>;
}
export default async function Page({searchParams}:{searchParams?:Promise<{error?:string;saved?:string;imported?:string;existing?:string;vip?:string}>}){
 const token=await session();const query=await searchParams;
 if(!token)return <main className="min-h-screen bg-[#07111f] p-8 text-slate-100"><h1 className="text-2xl">Research & VIP publishing</h1><p>Administrator login is required.</p><Link href="/admin/market-intelligence" className="text-sky-300 underline">Administrator login</Link></main>;
 let snap:QueueSnapshot;try{snap=await readQueue()}catch{return <main className="min-h-screen bg-[#07111f] p-8 text-slate-100">Private editorial queue is temporarily unavailable. No messages were sent.</main>}
 const vip=vipConfig(),sent=snap.state.items.filter(x=>x.vip_delivery?.status==="sent").length;
 return <main className="min-h-screen bg-[#07111f] px-4 py-10 text-slate-100"><div className="mx-auto max-w-6xl space-y-6">
  <header className="space-y-2"><p className="text-xs uppercase tracking-widest text-sky-300">CryptoMainly · Private editorial administrator</p><h1 className="text-3xl font-bold">Market Intelligence · VIP highlights</h1><p className="text-slate-300">Read the research and original chart, adjust any wording, confirm and send one individual highlight {process.env.MI_MAKE_HOSTED_QA==="true"?"to the private TEST Group":"to VIP"} in one action.</p><Link href="/admin/market-intelligence" className="text-sm text-sky-300 underline">Back to administrator</Link></header>
  <section className={panel}><div className="flex flex-wrap gap-4 text-base"><span><strong>{snap.state.items.length}</strong> research items</span><span><strong>{sent}</strong> {process.env.MI_MAKE_HOSTED_QA==="true"?"sent to TEST Group":"sent to VIP"}</span><span><strong>{snap.source.accounts.length}</strong> approved X sources</span></div><p className={"mt-3 text-sm "+(vip.enabled?"text-emerald-300":"text-amber-200")}>{vip.enabled?(process.env.MI_MAKE_HOSTED_QA==="true"?"Private TEST-group sending is configured. Each confirmed click delivers one message.":"VIP sending is configured. Each confirmed click delivers one message."):vip.reason}</p></section>
  {query?.vip==="sent"&&<p role="status" className="rounded-lg border border-emerald-700 p-4 text-emerald-300">Telegram confirmed delivery to the private test group. The post is recorded as sent.</p>}
  {query?.saved==="1"&&<p role="status" className="rounded-lg border border-sky-700 p-4 text-sky-300">Draft saved. No message sent.</p>}
  {query?.error&&<p role="alert" className="rounded-lg border border-rose-700 p-4 text-rose-300">{query.error==="vip_unknown"?"Telegram delivery outcome is uncertain. Check the VIP chat before taking any action; automatic retry is blocked.":query.error==="vip_disabled"?"VIP sending is not configured. Your draft remains private.":query.error==="stale"?"This draft has been updated since the page loaded. Refresh and review it before sending.":query.error==="confirm"?"Confirm the post before sending it.":"The editorial change could not be saved. Check the required fields and source URL; nothing was sent."}</p>}
  <details className={panel}><summary className="cursor-pointer font-semibold text-lg text-sky-300">Add a new research candidate</summary>
   <form method="post" action="/admin/market-intelligence/queue/action" className="mt-4 space-y-4"><Hidden token={token} version={snap.version} action="add"/><EditFields/><input type="hidden" name="reason" value="Owner added one private market intelligence candidate"/><label className="flex items-center gap-3 text-sm"><input name="confirm" type="checkbox" value="yes" required/>I confirm this draft is ready to save privately.</label><button className={button}>Add candidate</button></form>
  </details>
  {snap.state.items.length===0?<section className={panel}>No research candidates yet.</section>:<section className="space-y-6">{[...snap.state.items].sort((a,b)=>b.created_at_utc.localeCompare(a.created_at_utc)).map(i=><CandidateCard key={i.id} item={i} token={token} version={snap.version} writable={snap.writable} connected={vip.enabled} connectionReason={vip.reason}/>)}</section>}
  <details className={panel}><summary className="cursor-pointer text-lg font-semibold text-sky-300">Import scanner research (up to 12 candidates)</summary><p className="mt-2 text-sm text-slate-300">Scanner imports remain private. Importing does not send a post.</p>
   <form method="post" action="/admin/market-intelligence/queue/import" className="mt-3 space-y-3"><input type="hidden" name="csrf" value={csrf(token)}/><input type="hidden" name="version" value={snap.version}/><textarea className={input+" font-mono text-xs"} name="scan_payload" rows={6} maxLength={24000} required placeholder="Paste one complete scanner JSON batch here"/><button className={button}>Import candidates</button></form>
  </details>
  <details className={panel}><summary className="cursor-pointer text-lg font-semibold text-sky-300">Review audit history</summary><ul className="mt-3 space-y-2 text-sm">{[...snap.state.audit].reverse().slice(0,30).map((a,i)=><li key={i} className="border-b border-slate-700 py-1">{a.utc} · {a.action} · {a.reason}</li>)}</ul></details>
 </div></main>;
}
