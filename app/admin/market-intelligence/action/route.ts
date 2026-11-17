import { csrfOK,editorPath,form,session,trustedOrigin } from "../../../_mi/auth";
import { changed,readState,writeState } from "../../../_mi/state";
import { EDITORIAL_SOURCE_EDITIONS } from "../../../vip/market-intelligence/editions";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 const token=await session();if(!token)return new Response("Unauthorized",{status:401});
 let f:URLSearchParams;
 try{f=await form(req);if(!csrfOK(token,f.get("csrf")??""))return new Response("Forbidden",{status:403})}catch{return new Response("Forbidden",{status:403})}
 if(f.get("confirm")!=="yes")return Response.redirect(new URL(editorPath+"?error=confirm",trustedOrigin(req)),303);
 try{
 const snap=await readState();if(!snap.writable)return new Response("Changes disabled",{status:503});
 if(snap.version!==f.get("version"))return Response.redirect(new URL(editorPath+"?error=stale",trustedOrigin(req)),303);
 const g=(k:string)=>f.get(k)??"";
 const next=changed(snap.state,{action:g("action"),old:g("old"),handle:g("handle").trim().replace(/^@/,""),market:g("market"),focus:g("focus").trim(),days:f.getAll("day"),slug:g("slug"),post:g("post"),reason:g("reason")},EDITORIAL_SOURCE_EDITIONS);
 await writeState(snap.version,next);
 return Response.redirect(new URL(editorPath+"?saved=1",trustedOrigin(req)),303);
 }catch{return Response.redirect(new URL(editorPath+"?error=save",trustedOrigin(req)),303)}
}
