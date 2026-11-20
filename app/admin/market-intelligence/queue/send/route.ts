import {csrfOK,form,session,trustedOrigin} from "../../../../_mi/auth";
import {readQueue,writeQueue} from "../../../../_mi/review-queue";
import {vipConfig,reserveVipSend,recordVipSend,sendTelegramVip} from "../../../../_mi/vip-outbox";
import {EDITORIAL_SOURCE_EDITIONS} from "../../../../vip/market-intelligence/editions";
export const dynamic="force-dynamic";
const page="/admin/market-intelligence/queue";
function back(req:Request,code:string){return Response.redirect(new URL(page+"?"+code,trustedOrigin(req)),303)}
export async function POST(req:Request){
 const token=await session();
 if(!token)return new Response("Unauthorized",{status:401});
 let data:URLSearchParams;
 try{data=await form(req,16384);if(!csrfOK(token,data.get("csrf")??""))return new Response("Forbidden",{status:403})}catch{return new Response("Forbidden",{status:403})}
 if(data.get("confirm")!=="yes")return back(req,"error=confirm");
 if(!vipConfig().enabled)return back(req,"error=vip_disabled");
 const get=(s:string)=>data.get(s)??"";
 let itemId="";
 let requestId="";
 let reserved=false;
 try{
  const snap=await readQueue();
  if(!snap.writable)return new Response("VIP sending disabled",{status:503});
  if(snap.version!==get("version"))return back(req,"error=stale");
  itemId=get("id");
  if(!itemId)return back(req,"error=save");
  const draft=reserveVipSend(snap.state,itemId,{
   action:"edit",id:itemId,kind:get("kind"),market:get("market"),
   url:get("url").trim(),source_handle:get("source_handle").trim().replace(/^@/,""),
   title:get("title").trim(),summary:get("summary").trim(),why_it_matters:get("why_it_matters").trim(),limitations:get("limitations").trim(),
   published_at_utc:get("published_at_utc").trim(),edition_date:get("edition_date"),score:get("score"),
   evidence:[],reason:"One owner-confirmed VIP highlight",confirm:get("confirm"),
   vip_post_text:get("vip_post_text"),vip_image_url:get("vip_image_url").trim()
  },snap.source,EDITORIAL_SOURCE_EDITIONS.flatMap(e=>e.observations.map(o=>o.url)));
  requestId=draft.requestId;
  await writeQueue(snap.version,draft.state);
  reserved=true;
  let result:{ok:boolean;messageId?:number}={ok:false};
  try{const ack=await sendTelegramVip(draft.item,draft.message);result={ok:true,messageId:ack.messageId}}catch{/* Never retry an uncertain Telegram POST automatically. */}
  for(let attempt=0;attempt<3;attempt++){
   try{
    const state=await readQueue();
    const updated=recordVipSend(state.state,itemId,requestId,result);
    await writeQueue(state.version,updated);
    return back(req,result.ok?"vip=sent":"error=vip_unknown");
   }catch{ /* Bounded persistence retry, no Telegram re-send. */ }
  }
  return back(req,"error=vip_unknown");
 }catch{
  return back(req,reserved?"error=vip_unknown":"error=save");
 }
}
