import { configured,editorPath,form,issue,matches,session,csrfOK,setSession,trustedOrigin } from "../../../_mi/auth";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 try{const data=await form(req);
 if(data.get("logout")==="1"){const s=await session();if(!s||!csrfOK(s,data.get("csrf")??""))return new Response("Forbidden",{status:403});setSession("",0);return Response.redirect(new URL(editorPath,trustedOrigin(req)),303)}
 if(!configured())return new Response("Editorial access is not configured",{status:503});
 if(!matches(data.get("key")??""))return Response.redirect(new URL(editorPath+"?error=login",trustedOrigin(req)),303);
 setSession(issue());return Response.redirect(new URL(editorPath,trustedOrigin(req)),303);
 }catch{return new Response("Forbidden",{status:403})}
}
