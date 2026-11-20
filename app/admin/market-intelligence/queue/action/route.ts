import {csrfOK,form,session,trustedOrigin} from "../../../../_mi/auth";
import {approvalBlockers,readQueue,updateQueue,writeQueue} from "../../../../_mi/review-queue";
import {EDITORIAL_SOURCE_EDITIONS} from "../../../../vip/market-intelligence/editions";
export const dynamic="force-dynamic";
const route="/admin/market-intelligence/queue";
function redirect(req:Request,param:string){return Response.redirect(new URL(route+param,trustedOrigin(req)),303)}
export async function POST(req:Request){
 const token=await session();if(!token)return new Response("Unauthorized",{status:401});
 let data:URLSearchParams;
 try{data=await form(req,16384);if(!csrfOK(token,data.get("csrf")??""))return new Response("Forbidden",{status:403})}catch{return new Response("Forbidden",{status:403})}
 if(data.get("confirm")!=="yes")return redirect(req,"?error=confirm");
 try{
  const snap=await readQueue();
  if(!snap.writable)return new Response("Changes disabled",{status:503});
  if(snap.version!==data.get("version"))return redirect(req,"?error=stale");
  const get=(x:string)=>data.get(x)??"";
  if(get("action")==="approve"){
   const candidate=snap.state.items.find(x=>x.id===get("id"));
   if(!candidate||approvalBlockers(candidate,snap.source).length)return redirect(req,"?error=approval");
  }
  const next=updateQueue(snap.state,{
   action:get("action"),id:get("id"),kind:get("kind"),market:get("market"),
   url:get("url").trim(),source_handle:get("source_handle").trim().replace(/^@/,""),
   title:get("title").trim(),summary:get("summary").trim(),why_it_matters:get("why_it_matters").trim(),limitations:get("limitations").trim(),
   published_at_utc:get("published_at_utc").trim(),edition_date:get("edition_date"),score:get("score"),evidence:data.getAll("evidence"),reason:get("reason").trim(),confirm:get("confirm"),vip_post_text:get("vip_post_text"),vip_image_url:get("vip_image_url").trim()
  },snap.source,EDITORIAL_SOURCE_EDITIONS.flatMap(e=>e.observations.map(p=>p.url)));
  await writeQueue(snap.version,next);
  return redirect(req,"?saved=1");
 }catch{return redirect(req,"?error=save")}
}
