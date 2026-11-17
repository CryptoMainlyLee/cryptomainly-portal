import "server-only";
import {readState,type Visibility} from "./state";
import {EDITORIAL_SOURCE_EDITIONS,type ResearchEdition} from "../vip/market-intelligence/editions";
export function visibleEditions(v:Visibility):ResearchEdition[]{return EDITORIAL_SOURCE_EDITIONS.filter(e=>!v.hidden_edition_slugs.includes(e.slug)).map(e=>{const hide=new Set(v.hidden_post_ids_by_edition[e.slug]??[]);const observations=e.observations.filter(p=>!hide.has(p.id));return {...e,observations,...(observations.length!==e.observations.length?{summary:"Curated market research — revised edition.",highlights:[]}: {})}}).filter(e=>e.observations.length>0)}
export async function publicEditions(){return visibleEditions((await readState()).state.editorial_visibility)}
export async function imageAllowed(slug:string){const v=(await readState()).state.editorial_visibility;return !v.hidden_edition_slugs.includes(slug)&&!(v.hidden_post_ids_by_edition[slug]?.length)&&EDITORIAL_SOURCE_EDITIONS.some(e=>e.slug===slug)}
