/** @OnlyCurrentDoc */
'use strict';
// Install ONLY as a container-bound script of the dedicated private test bridge.
const CM_BRIDGE_ID='1KR9PPHN9faTrevjjVuIIcXegiA5uMx04knAJNi1hUmE';
const CM_SOURCE='https://raw.githubusercontent.com/CryptoMainlyLee/cryptomainly-portal/cryptomainly-source-registry/source-registry.json';
const CM_DAYS=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const CM_SCHEMA='cryptomainly-scanner-bridge-v1';
function cmSorted(v){return Array.isArray(v)?v.map(cmSorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,cmSorted(v[k])])):v}
function cmHash(v){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(cmSorted(v)),Utilities.Charset.UTF_8).map(b=>(b&255).toString(16).padStart(2,'0')).join('')}
function cmProject(s){
 if(!s||s.schema!=='cryptomainly-source-registry-v1'||!Array.isArray(s.accounts)||s.accounts.length<1||s.accounts.length>50||s.source_count!==s.accounts.length)throw Error('invalid-schema');
 if(typeof s.updated_at_utc!=='string'||!Number.isFinite(Date.parse(s.updated_at_utc))||Date.parse(s.updated_at_utc)>Date.now()+300000)throw Error('invalid-source-time');
 const seen=new Set();const accounts=s.accounts.map(a=>{
  if(!a||typeof a.handle!=='string'||!/^[A-Za-z0-9_]{1,15}$/.test(a.handle)||seen.has(a.handle.toLowerCase())||!['crypto','stocks','both'].includes(a.market)||typeof a.focus!=='string'||a.focus.length<8||a.focus.length>180||/[\u0000-\u001f\u007f]/.test(a.focus))throw Error('invalid-account');
  seen.add(a.handle.toLowerCase());return {handle:a.handle,market:a.market,focus:a.focus};
 });
 if(!s.daily_primary_accounts||Object.keys(s.daily_primary_accounts).length!==7)throw Error('invalid-days');
 const daily_primary_accounts=Object.fromEntries(CM_DAYS.map(d=>{
  const x=s.daily_primary_accounts[d];
  if(!x||x.uk_time!==(d==='monday'?'10:00':'15:30')||!Array.isArray(x.primary_accounts)||!x.primary_accounts.every(h=>typeof h==='string'&&seen.has(h.toLowerCase()))||new Set(x.primary_accounts.map(h=>h.toLowerCase())).size!==x.primary_accounts.length)throw Error('invalid-priorities');
  return [d,{uk_time:x.uk_time,primary_accounts:x.primary_accounts.slice()}];
 }));
 const payload={accounts,daily_primary_accounts};
 if(typeof s.revision_sha256!=='string'||s.revision_sha256!==cmHash(payload))throw Error('revision-mismatch');
 return {schema:s.schema,revision_sha256:s.revision_sha256,updated_at_utc:s.updated_at_utc,source_count:accounts.length,...payload};
}
function cmCell(){
 const book=SpreadsheetApp.getActiveSpreadsheet();
 if(!book||book.getId()!==CM_BRIDGE_ID)throw Error('wrong-container');
 const sheet=book.getSheetByName('Registry');
 if(!sheet||sheet.getRange('A1').getValue()!=='Machine-readable registry envelope — private test; do not edit')throw Error('wrong-bridge-sheet');
 return sheet.getRange('A2');
}
function refreshRegistryBridge(){
 const cell=cmCell();const lock=LockService.getScriptLock();if(!lock.tryLock(3000))throw Error('refresh-already-running');
 try{
  let result;
  try{
   const res=UrlFetchApp.fetch(CM_SOURCE,{method:'get',followRedirects:false,muteHttpExceptions:true,validateHttpsCertificates:true,headers:{'Cache-Control':'no-cache',Accept:'application/json'}});
   if(res.getResponseCode()!==200)throw Error('source-http-error');
   const body=res.getContentText('UTF-8');if(body.length>60000)throw Error('source-oversized');
   const registry=cmProject(JSON.parse(body));
   result={schema:CM_SCHEMA,mode:'TEST_ONLY',status:'ok',checked_at_utc:new Date().toISOString(),source_url:CM_SOURCE,registry};
   if(JSON.stringify(result).length>45000)throw Error('mirror-oversized');
  }catch(_err){result={schema:CM_SCHEMA,mode:'TEST_ONLY',status:'error',checked_at_utc:new Date().toISOString(),source_url:CM_SOURCE,registry:null};}
  // A single JSON cell is the entire snapshot. No partially updated multi-row roster.
  cell.setValue(JSON.stringify(result));SpreadsheetApp.flush();
  if(result.status!=='ok')throw Error('Registry refresh failed; scanner must not use this snapshot.');
  return result.registry.revision_sha256;
 }finally{lock.releaseLock()}
}
function installRegistryBridge(){
 // Must first succeed with real fetch and verified state; never schedule on failure.
 refreshRegistryBridge();
 const existing=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='refreshRegistryBridge');
 if(existing.length>1)throw Error('Duplicate refresh triggers: reconcile manually');
 if(existing.length===0)ScriptApp.newTrigger('refreshRegistryBridge').timeBased().everyMinutes(15).create();
}
function stopRegistryBridge(){
 cmCell();
 ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='refreshRegistryBridge').forEach(t=>ScriptApp.deleteTrigger(t));
}
