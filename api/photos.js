/* Still-On-Fire V23: CORS-safe, read-only Google Apps Script photo-feed relay.
   /api/photos?health=1 returns a diagnostic WITHOUT listing family photo URLs.
   Vercel environment variable optional: SOFIRE_GOOGLE_PHOTO_FEED_URL.
*/
'use strict';
const DEFAULT_FEED='https://script.google.com/macros/s/AKfycbyaEMBcOb0-FisrU5Zm3yi4w9ptceioZ2Ng8PJJJq0G6KBGcEPNdmloexOXgNlugCHe/exec';
const FEED=process.env.SOFIRE_GOOGLE_PHOTO_FEED_URL||DEFAULT_FEED;
const TIMEOUT_MS=8200;
function httpError(code,message,status,upstreamStatus) {
  const e=new Error(message);
  e.code=code; e.httpStatus=status||502; e.upstreamStatus=upstreamStatus||null;
  return e;
}
function sourceIsValid(input) {
  try {const u=new URL(input);return u.protocol==='https:' && u.hostname==='script.google.com' && /^\/macros\/s\/[^/]+\/exec$/.test(u.pathname);}
  catch (_) {return false;}
}
function entries(data){
  if(Array.isArray(data))return data;
  if(!data || typeof data!=='object')return null;
  if(data.error)throw httpError('SCRIPT_ERROR',String(data.error).slice(0,140),502);
  return [data.images,data.photos,data.items,data.files,data.results,data.data,
    data.data&&data.data.images,data.data&&data.data.photos,data.data&&data.data.items]
    .find(Array.isArray)||null;
}
function normalize(data) {
  const list=entries(data);
  if(!list)throw httpError('UNSUPPORTED_FEED','Feed JSON does not contain a photo array',502);
  const found=new Map();
  for(const item of list){
    const entry=(item&&typeof item==='object')?item:null;
    if(entry&&entry.mimeType&&!/^image\//.test(entry.mimeType))continue;
    const u=typeof item==='string'?item:entry&&(entry.url||entry.src||entry.downloadUrl||entry.imageUrl||entry.originalUrl||entry.fullSizeUrl||entry.thumbnailUrl||entry.thumbnailLink||entry.photoUrl||entry.webContentLink);
    if(typeof u!=='string'||!/^https:\/\//i.test(u))continue;
    const fileId=entry&&(entry.fileId||entry.id||entry.driveId)||null;
    const key=fileId?String(fileId):u.replace(/([?&](?:sz|w|cache|_=)[^&]+)|=[ws]\d+$/g,'');
    if(!found.has(key))found.set(key,{id:fileId||undefined,url:u,mimeType:entry&&entry.mimeType||undefined});
    if(found.size>=3000)break;
  }
  if(!found.size)throw httpError('NO_USABLE_PHOTOS','Feed returned no usable HTTPS image URLs',502);
  return Array.from(found.values());
}
async function fetchOnce(){
  const controller=new AbortController(); const alarm=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try {
    const response=await fetch(FEED,{redirect:'follow',signal:controller.signal,headers:{Accept:'application/json,text/plain;q=0.9,*/*;q=0.5'},cache:'no-store'});
    if(!response.ok){
      const status=response.status;
      const code=status===401||status===403?'GOOGLE_ACCESS_DENIED':status===404?'GOOGLE_DEPLOYMENT_NOT_FOUND':status===429?'GOOGLE_RATE_LIMITED':'GOOGLE_HTTP_'+status;
      throw httpError(code,'Google Apps Script returned HTTP '+status,502,status);
    }
    const raw=await response.text();
    if(/^\s*<!doctype html|^\s*<html[\s>]/i.test(raw))throw httpError('GOOGLE_RETURNED_HTML','Google served an HTML/login page, not a public JSON photo feed',502);
    let json;try{json=JSON.parse(raw);}catch(_){throw httpError('GOOGLE_NOT_JSON','Google Apps Script response was not JSON',502);}
    return normalize(json);
  } catch(e){
    if(e.name==='AbortError')throw httpError('GOOGLE_TIMEOUT','Timed out waiting for Google Apps Script',504);
    if(!e.code)throw httpError('GOOGLE_NETWORK',String(e.message||'Network error').slice(0,140),502);
    throw e;
  } finally{clearTimeout(alarm);}
}
function hint(code){
  const h={GOOGLE_ACCESS_DENIED:'Deploy Google Apps Script as: Execute as Me; Who has access: Anyone (including visitors not signed in).',
    GOOGLE_DEPLOYMENT_NOT_FOUND:'Apps Script deployment URL is invalid, expired, or its redirected response returned 404; redeploy and update SOFIRE_GOOGLE_PHOTO_FEED_URL.',
    GOOGLE_RETURNED_HTML:'Apps Script is serving a sign-in page; verify anonymous web-app access and correct /exec URL.',
    GOOGLE_NOT_JSON:'The Apps Script must return JSON (or use the Code.gs included in the ZIP).',
    GOOGLE_TIMEOUT:'Apps Script timed out. Check Apps Script Executions and retry.',
    GOOGLE_NETWORK:'Vercel could not reach Google Apps Script; check deployment URL and Apps Script Executions.',
    SCRIPT_ERROR:'The Google script reported an error; check its folder ID and owner Drive access.',
    NO_USABLE_PHOTOS:'Check that the Google Drive folder contains photos and the script returns usable image URLs.',
    UNSUPPORTED_FEED:'The script must return an images array containing URLs.'};
  return h[code]||'Check the Google Apps Script deployment and folder access. Visit /api/photos?health=1 for the failure code.';
}
async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});}
  if(!sourceIsValid(FEED))return res.status(500).json({ok:false,code:'FEED_CONFIG_INVALID',hint:'Set SOFIRE_GOOGLE_PHOTO_FEED_URL to a Google Apps Script /exec deployment URL.'});
  let lastErr=null;
  for(let attempt=0;attempt<2;attempt++) {
    try {
      const photos=await fetchOnce();
      res.setHeader('Cache-Control','public, max-age=0, s-maxage=35, stale-while-revalidate=30');
      if(req.query&&String(req.query.health||'')==='1')return res.status(200).json({ok:true,version:'V23',source:'Google Apps Script',photoCount:photos.length});
      return res.status(200).json({ok:true,version:'V23',source:'Google Apps Script',count:photos.length,images:photos});
    }catch(e){lastErr=e; const transient=['GOOGLE_TIMEOUT','GOOGLE_NETWORK','GOOGLE_DEPLOYMENT_NOT_FOUND','GOOGLE_RATE_LIMITED','GOOGLE_HTTP_500','GOOGLE_HTTP_502','GOOGLE_HTTP_503'];
      if(attempt===0&&transient.includes(e.code))await new Promise(resolve=>setTimeout(resolve,350));else break;
    }
  }
  const code=lastErr&&lastErr.code||'UNKNOWN_FEED_ERROR';
  console.error('[Still-On-Fire V23 photos]',code,lastErr&&lastErr.message);
  return res.status(lastErr&&lastErr.httpStatus||502).json({ok:false,version:'V23',code,upstreamStatus:lastErr&&lastErr.upstreamStatus||undefined,hint:hint(code)});
}
module.exports=handler;
module.exports._test={normalize,entries,sourceIsValid,hint};
