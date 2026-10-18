/* Still-On-Fire V25: cached, read-only Google Apps Script photo manifest relay.
   Serves a last-good gallery during temporary Google outages. Never modifies Drive.
*/
'use strict';
// New Google Apps Script deployment provided by the site owner.
// Pinned for this package: an OLD SOFIRE_GOOGLE_PHOTO_FEED_URL variable in Vercel
// must not silently override the working new deployment.
const FEED='https://script.google.com/macros/s/AKfycbyNyjiLE1D--fyi-83U1dTK1sbUGJDihUOBwxyPJ7T8PCTZRX0KfrPhEQnZZu5QU04Lwg/exec';
const FRESH_MS=3*60*1000;
const MAX_STALE_MS=24*60*60*1000;
const TIMEOUT_MS=16000;
let cache=null;
let pending=null;
function err(code,status,message){const e=new Error(message||code);e.code=code;e.status=status||502;return e;}
function validFeed(value){try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='script.google.com'&&/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname);}catch(_){return false;}}
function extract(data){
 if(Array.isArray(data))return data;
 if(!data||typeof data!=='object')throw err('GOOGLE_NOT_JSON',502);
 if(data.ok===false||data.error)throw err('GOOGLE_SCRIPT_ERROR',502,String(data.error||'Unknown script error').slice(0,120));
 const a=[data.images,data.photos,data.items,data.files,data.results,data.data,data.data&&data.data.images].find(Array.isArray);
 if(!a)throw err('GOOGLE_NO_PHOTO_ARRAY',502);
 return a;
}
function normalize(data){
 const out=new Map();
 for(const entry of extract(data)){
  const p=entry&&typeof entry==='object'?entry:null;
  if(p&&p.mimeType&&!/^image\//i.test(p.mimeType))continue;
  const url=typeof entry==='string'?entry:p&&(p.url||p.src||p.thumbnailUrl||p.originalUrl||p.fullSizeUrl||p.downloadUrl);
  if(typeof url!=='string'||!url.startsWith('https://'))continue;
  const id=p&&(p.id||p.fileId||p.driveId);
  const key=id?String(id):url.replace(/([?&](?:sz|w|width)=[^&]+)|=w\d+$/g,'');
  if(out.has(key))continue;
  out.set(key,{id:id||undefined,url,
    mimeType:p&&p.mimeType||undefined,
    originalUrl:p&&(p.originalUrl||p.originalImageUrl)||undefined,
    fullSizeUrl:p&&(p.fullSizeUrl||p.fullUrl)||undefined,
    highResUrl:p&&(p.highResUrl||p.highQualityUrl)||undefined,
    downloadUrl:p&&p.downloadUrl||undefined,
    webContentLink:p&&p.webContentLink||undefined,
    thumbnailUrl:p&&p.thumbnailUrl||undefined});
  if(out.size>=2500)break;
 }
 if(!out.size)throw err('GOOGLE_EMPTY_GALLERY',502);
 return [...out.values()];
}
async function fetchGallery(){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),TIMEOUT_MS);
 try {
  const response=await fetch(FEED,{redirect:'follow',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw err(response.status===401||response.status===403?'GOOGLE_ACCESS_DENIED':`GOOGLE_HTTP_${response.status}`,502);
  const body=await response.text();
  if(/^\s*(?:<!doctype|<html)/i.test(body))throw err('GOOGLE_LOGIN_OR_HTML',502);
  let json;try{json=JSON.parse(body);}catch(_){throw err('GOOGLE_INVALID_JSON',502);}
  const photos=normalize(json);
  cache={photos,fetchedAt:Date.now(),updatedAt:json&&json.updatedAt||null};
  return cache;
 }catch(e){
  if(e.name==='AbortError')throw err('GOOGLE_TIMEOUT',504);
  if(e.code)throw e;
  throw err('GOOGLE_NETWORK_ERROR',502);
 }finally{clearTimeout(timeout);}
}
function load(){
 if(cache&&Date.now()-cache.fetchedAt<FRESH_MS)return Promise.resolve({entry:cache,mode:'live'});
 if(!pending)pending=fetchGallery().finally(()=>{pending=null;});
 return pending.then(entry=>({entry,mode:'live'}),e=>{
  if(cache&&Date.now()-cache.fetchedAt<MAX_STALE_MS)return {entry:cache,mode:'cached',errorCode:e.code};
  throw e;
 });
}
function send(res,status,data){res.status(status).json(data);}
async function handler(req,res){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 // Keep cached photos for the next refresh, but return JSON before platform timeout.
 res.setHeader('Cache-Control','public, max-age=0, s-maxage=45, stale-while-revalidate=60');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return send(res,405,{ok:false,code:'METHOD_NOT_ALLOWED'});}
 if(!validFeed(FEED))return send(res,500,{ok:false,code:'INVALID_FEED_URL'});
 // Browser can discover the PUBLIC read-only JSONP endpoint for a last-resort
 // bypass of the relay. No credentials or private configuration are exposed.
 if(req.query&&String(req.query.config||'')==='1')return send(res,200,{ok:true,jsonpFeedUrl:FEED});
 try{
  const {entry,mode,errorCode}=await load();
  const data={ok:true,version:'V25',mode,count:entry.photos.length,updatedAt:entry.updatedAt,cacheAgeSeconds:Math.round((Date.now()-entry.fetchedAt)/1000)};
  if(errorCode)data.warningCode=errorCode;
  if(req.query&&String(req.query.health||'')==='1')return send(res,200,data);
  return send(res,200,{...data,images:entry.photos});
 }catch(e){
  const code=e.code||'GOOGLE_FEED_ERROR';
  console.error('[Still-On-Fire photo feed]',code,e.message);
  res.setHeader('Cache-Control','no-store');
  return send(res,e.status||502,{ok:false,version:'V25',code,
   hint:code==='GOOGLE_TIMEOUT'?'Google Apps Script has not returned its photo index. Install the V25 prebuilt snapshot script, refresh once and redeploy it.':
        code==='GOOGLE_SCRIPT_ERROR'?'The Apps Script has not initialized its snapshot or cannot access the folder. Check Apps Script Executions.':
        code==='GOOGLE_ACCESS_DENIED'?'Deploy Apps Script as Me, accessible to Anyone, and verify folder permissions.':
        'Check the Google Apps Script deployment and shared folder permissions.'});
 }
}
module.exports=handler;
module.exports._test={normalize,extract,validFeed,fetchGallery,handler};
