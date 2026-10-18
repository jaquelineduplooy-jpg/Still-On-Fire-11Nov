/* Still On Fire | V25 - cached complete gallery, sequential retry and genuinely shuffled TV playback.
   The public Google Apps Script returns display-ready photo URLs. Keep those URLs:
   never replace them with drive.google.com/thumbnail links guessed from a Drive ID.
   Shuffle distinct photos without repeating until a complete deck has been shown.
*/
(function () {
  'use strict';

  const storedPrefix = 'sofire-v25-last:';
  const galleryCacheKey = 'still-on-fire-v25-last-good-gallery';
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
  function getSavedLast(key) {
    try { return sessionStorage.getItem(storedPrefix + key); } catch (_) { return null; }
  }
  function setSavedLast(key, value) {
    try { sessionStorage.setItem(storedPrefix + key, value); } catch (_) { /* file: URLs */ }
  }
  function createDeck(photos, key) {
    let queue = [];
    let last = getSavedLast(key);
    const consumed = [];
    function next(avoid) {
      if (!queue.length) {
        queue = shuffle(photos.slice());
        if (queue.length > 1 && queue[0].key === last) {
          const i = 1 + Math.floor(Math.random() * (queue.length - 1));
          [queue[0], queue[i]] = [queue[i], queue[0]];
        }
      }
      // Swap within the existing deck rather than discarding an image.
      if (avoid && queue.length > 1 && avoid.has(queue[0].key)) {
        const i = queue.findIndex(p => !avoid.has(p.key) && p.key !== last);
        if (i > 0) [queue[0], queue[i]] = [queue[i], queue[0]];
      }
      const photo = queue.shift();
      if (!photo) return null;
      last = photo.key;
      consumed.push(last);
      setSavedLast(key, last);
      return photo;
    }
    return { next, get drawn() {return consumed.slice();} };
  }

  function sourceKey(raw, item) {
    const explicit = item && (item.fileId || item.driveId || item.id);
    if (typeof explicit === 'string' && /^[A-Za-z0-9_-]{20,}$/.test(explicit)) return 'drive:' + explicit;
    try {
      const url = new URL(raw, location.href);
      let id = url.searchParams.get('id');
      if (!id) {
        const fromPath = url.pathname.match(/\/(?:file\/d|d)\/([A-Za-z0-9_-]{20,})/);
        if (fromPath) id = fromPath[1];
      }
      if (id && /^[A-Za-z0-9_-]{20,}$/.test(id)) return 'drive:' + id;
      for (const param of ['sz','w','width','height','cache','cachebuster','_']) url.searchParams.delete(param);
      return 'url:' + url.origin + url.pathname.replace(/=(?:w\d+(?:-h\d+)?|s\d+)(?:-[\w-]+)*$/i,'') + url.search;
    } catch (_) { return 'url:' + raw; }
  }

  // This follows the working Tankwa implementation: only upgrade Google's
  // existing size parameter. Never discard public/signed source URLs.
  function imageVariant(source, width) {
    if (!/^https?:\/\//i.test(source)) return source;
    try {
      const u = new URL(source);
      const google = /(?:^|\.)(?:googleusercontent\.com|google\.com)$/.test(u.hostname);
      if (!google) return source;
      if (u.searchParams.has('sz')) { u.searchParams.set('sz', 'w' + width); return u.href; }
      if (u.searchParams.has('w')) { u.searchParams.set('w', String(width)); return u.href; }
      if (/=(?:w\d+(?:-h\d+)?|s\d+)(?:-[\w-]+)*$/i.test(source))
        return source.replace(/=(?:w\d+(?:-h\d+)?|s\d+)(?:-[\w-]+)*$/i, '=w' + width);
    } catch (_) { /* Keep working source if a URL cannot be parsed. */ }
    return source;
  }

  // Preserve every supplied photo source: a thumbnail URL is NOT an original.
  // Google feeds often return both; the V23 relay silently discarded the original.
  function itemToPhoto(item) {
    const obj=item && typeof item==='object' && !Array.isArray(item) ? item : null;
    if(obj && obj.mimeType && !/^image\//i.test(obj.mimeType)) return null;
    const valid = u => typeof u==='string' && /^(?:https?:\/\/|\.\.?\/|\/?assets\/|data:image\/(?:jpeg|png|webp|gif);base64,)/i.test(u.trim());
    const unique = values => [...new Set(values.filter(valid).map(u=>u.trim()))];
    const originals=obj ? unique([
      obj.originalUrl,obj.fullSizeUrl,obj.originalImageUrl,obj.webContentLink,
      obj.downloadUrl,obj.highResUrl,obj.fullUrl
    ]) : [];
    const previews=obj ? unique([
      obj.url,obj.src,obj.imageUrl,obj.photoUrl,obj.thumbnailUrl,
      obj.thumbnailLink,obj.previewUrl,obj.link
    ]) : unique([item]);
    // A file-ID-only response remains viewable through Google's thumbnail endpoint.
    if(!originals.length && !previews.length && obj && /^[A-Za-z0-9_-]{20,}$/.test(String(obj.fileId || obj.id || '')))
      previews.push('https://drive.google.com/thumbnail?id='+encodeURIComponent(obj.fileId||obj.id)+'&sz=w3200');
    if(!originals.length && !previews.length) return null;
    const first=originals[0]||previews[0];
    const hash=obj && (obj.md5Checksum || obj.sha256Checksum);
    const key=hash?'hash:'+hash:sourceKey(first,obj);
    const uniqueLinks=links=>[...new Set(links)];
    function variants(list,width) {
      const result=[];
      for(const u of list) {
        const hi=imageVariant(u,width);
        if(hi!==u)result.push(hi);
        result.push(u);
      }
      return uniqueLinks(result);
    }
    return {
      key,url:first,
      hasOriginal:originals.length>0,
      rawOriginalUrls:originals,
      fullCandidates(width) {
        // The first group is for the original file, the second for previews.
        // Do NOT allow a 640px preview to win a race against a 4000px original.
        const target = width>=3000?4096:Math.max(2400,Math.round(width));
        return {original:variants(originals,target),preview:variants(previews,target)};
      },
      thumbCandidates() { return uniqueLinks(variants(previews.length?previews:originals,1100).concat(originals)); },
      sourceItem:obj ? {
        id:obj.id||obj.fileId||obj.driveId,
        url:previews[0]||originals[0],
        originalUrl:obj.originalUrl||obj.originalImageUrl,
        fullSizeUrl:obj.fullSizeUrl||obj.fullUrl,
        highResUrl:obj.highResUrl,
        downloadUrl:obj.downloadUrl,
        webContentLink:obj.webContentLink,
        mimeType:obj.mimeType
      } : item
    };
  }

  async function bestForHero(photo,width,timeoutMs) {
    const sources=photo.fullCandidates(width);
    // Prefer actual originals; if unavailable try their full-size preview links.
    let original=null;
    if(sources.original.length) {
      original=await firstWorking(sources.original.slice(0,4),timeoutMs);
      // The original wins when it has real display-sized native pixels.
      if(original && original.width>=1600)return original;
    }
    const preview=await firstWorking(sources.preview.slice(0,4),timeoutMs);
    if(preview && (!original || preview.width>original.width))return preview;
    if(original)return original;
    // A few feeds provide more fallback URLs beyond the first batch.
    return firstWorking(sources.original.slice(4,7).concat(sources.preview.slice(4,7)),Math.min(timeoutMs,2400));
  }

  function parseFeed(json) {
    let list = Array.isArray(json) ? json : null;
    if (!list && json && typeof json === 'object') {
      list = [json.images,json.items,json.photos,json.files,json.results,json.data,
        json.data && json.data.images,json.data && json.data.items,
        json.data && json.data.photos,json.data && json.data.files].find(Array.isArray);
    }
    if (!list) return [];
    const unique = new Map();
    for (const entry of list) {
      const photo = itemToPhoto(entry);
      if (photo && !unique.has(photo.key)) unique.set(photo.key, photo);
    }
    return [...unique.values()];
  }

  function loadPhoto(url, timeoutMs) {
    return new Promise(resolve => {
      const image = new Image();
      image.decoding = 'async';
      let done = false;
      const timeout = setTimeout(() => finish(null), timeoutMs);
      function finish(result) {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        image.onload = image.onerror = null;
        resolve(result);
      }
      image.onload = () => finish(image.naturalWidth ? {src:url,width:image.naturalWidth,height:image.naturalHeight} : null);
      image.onerror = () => finish(null);
      image.src = url;
    });
  }
  async function firstWorking(candidates, timeoutMs) {
    // V22 waited for up to ten photos * several sequential 4-second failures.
    // Check candidates concurrently: the connection indicator cannot hang for minutes.
    const choices=[...new Set(candidates)].slice(0,3);
    const results=await Promise.all(choices.map(src=>loadPhoto(src,Math.min(3800,timeoutMs||3800))));
    return results.filter(Boolean).sort((a,b)=>b.width-a.width)[0]||null;
  }

  function buildHero(img, photos, opts) {
    if (!img) return { stop() {} };
    const deck = createDeck(photos,opts.key+':hero');
    const interval = Math.max(2500,Number(opts.heroInterval)||7000);
    let running = true, timer = null;
    img.style.objectFit = 'contain';
    img.style.objectPosition = 'center';
    img.style.filter = 'none';
    img.style.transform = 'none';
    img.decoding = 'async';
    img.loading = 'eager';
    img.setAttribute('fetchpriority','high');

    async function next() {
      if (!running) return;
      if (document.hidden) { timer=setTimeout(next,900); return; }
      let loaded = null, photo = null;
      const want = Math.max((img.clientWidth || 1100)*(devicePixelRatio||1),innerWidth>=2400?3200:2048);
      for (let i=0;i<photos.length && running;i++) {
        const candidate = deck.next();
        if (!candidate) break;
        const result = await bestForHero(candidate,want,4800);
        if (!running) return;
        if (result) { loaded=result; photo=candidate; break; }
      }
      if (loaded && running) {
        img.src = loaded.src;
        img.dataset.photoKey = photo.key;
        img.dataset.photoWidth = String(loaded.width);
        img.dataset.photoHeight = String(loaded.height);
        // Never upscale a low-resolution file past its true native pixel width on a 4K TV.
        img.style.maxWidth = loaded.width + 'px';
        img.style.marginInline = 'auto';
        img.dataset.sourceQuality = loaded.width>=3000?'4K candidate':loaded.width>=1920?'HD candidate':'below HD';
        img.style.visibility = 'visible';
        if (typeof opts.onHeroChange === 'function') opts.onHeroChange(photo.key);
      }
      timer=setTimeout(next,loaded?interval:5000);
    }
    // Never force the first saved photograph on every load.
    if (!img.dataset.photoKey) img.removeAttribute('src');
    next();
    return { stop(){ running=false;clearTimeout(timer); } };
  }

  function buildStrip(track,photos,opts) {
    const parent = track.parentElement;
    const deck = createDeck(photos,opts.key+':strip');
    let running=true, frame=0, last=0, x=0, nextPhotoId=null;
    let stripKeys=[];
    const speed = Number(opts.speed) || 22;
    function makeFrame(photo) {
      const box=document.createElement('div');
      box.className=opts.frameClass;
      box.dataset.photoKey=photo.key;
      const img=document.createElement('img');
      img.alt='Family memory';
      img.loading='eager'; img.decoding='async';
      img.style.objectFit='contain';
      img.style.filter='none';
      const candidates=photo.thumbCandidates();
      let i=0;
      img.onerror=()=>{ if (++i<candidates.length) img.src=candidates[i]; else img.style.visibility='hidden'; };
      img.src=candidates[0];
      box.appendChild(img);
      return box;
    }
    function appendOne() {
      // Avoid an immediate identical neighbour or hero where alternatives exist.
      const avoid=new Set(stripKeys.length?[stripKeys[stripKeys.length-1]]:[]);
      const hero=opts.heroId?document.getElementById(opts.heroId):null;
      if (hero && hero.dataset.photoKey && photos.length>2) avoid.add(hero.dataset.photoKey);
      const photo=deck.next(avoid);
      if (!photo) return;
      track.appendChild(makeFrame(photo));
      stripKeys.push(photo.key);
      nextPhotoId=photo.key;
    }
    function initialize() {
      // Keep an entire extra viewport queued; DO NOT clone a fixed first batch.
      const test=document.createElement('div');test.className=opts.frameClass;
      track.replaceChildren(test);
      const frameWidth=test.getBoundingClientRect().width||280;
      const gap=parseFloat(getComputedStyle(track).gap)||0;
      const total=Math.ceil(parent.clientWidth/(frameWidth+gap))+5;
      track.replaceChildren();stripKeys=[];x=0;last=0;
      for(let i=0;i<Math.max(7,total);i++)appendOne();
      track.style.transform='translate3d(0px,0,0)';
    }
    function tick(now) {
      if (!running) return;
      const elapsed=last?Math.min(now-last,100)/1000:0;last=now;
      if (!document.hidden && track.firstElementChild) {
        x-=speed*elapsed;
        const first=track.firstElementChild;
        const gap=parseFloat(getComputedStyle(track).gap)||0;
        const distance=first.getBoundingClientRect().width+gap;
        while (distance && x<=-distance && track.firstElementChild) {
          x+=distance;
          track.firstElementChild.remove();
          stripKeys.shift();
          appendOne();
        }
        track.style.transform='translate3d('+x+'px,0,0)';
      }
      frame=requestAnimationFrame(tick);
    }
    function onResize() {if(running)initialize();}
    initialize();
    window.addEventListener('resize',onResize);
    frame=requestAnimationFrame(tick);
    return { stop(){running=false;cancelAnimationFrame(frame);window.removeEventListener('resize',onResize);} };
  }

  async function loadFeed(url,timeoutMs) {
    const controller=new AbortController();
    const alarm=setTimeout(()=>controller.abort(),timeoutMs||9000);
    try {
      const res=await fetch(url,{cache:'no-store',signal:controller.signal,redirect:'follow'});
      let json=null;
      try { json=await res.json(); } catch(_) { /* HTML login or blocked redirect */ }
      if(!res.ok) {
        const error=new Error('Photo service HTTP '+res.status);
        error.code=json&&json.code||'HTTP_'+res.status;
        throw error;
      }
      const images=parseFeed(json);
      if(!images.length) {const error=new Error('Photo feed contains no valid image URLs');error.code='EMPTY_PHOTO_FEED';throw error;}
      return {photos:images,mode:(json&&json.mode)||'live',warningCode:(json&&json.warningCode)||null};
    } finally { clearTimeout(alarm); }
  }

  function loadJsonp(url,timeoutMs) {
    return new Promise((resolve,reject)=>{
      // Works only when Apps Script returns read-only JSONP. The optional
      // Code.gs in this package implements that protocol.
      const callback='sofireGalleryCallback'+Math.floor(Math.random()*1000000000);
      const tag=document.createElement('script');
      const sep=url.indexOf('?')<0?'?':'&';
      let finished=false;
      const alarm=setTimeout(()=>done(null,new Error('JSONP connection timed out')),timeoutMs||8500);
      function done(photos,err) {
        if(finished)return;
        finished=true;clearTimeout(alarm);tag.remove();
        try{delete window[callback];}catch(_){window[callback]=undefined;}
        if(err)reject(err);else resolve(photos);
      }
      window[callback]=function(payload){
        const photos=parseFeed(payload);
        if(photos.length)done({photos,mode:'jsonp'},null);
        else done(null,new Error('JSONP returned no photographs'));
      };
      tag.onerror=()=>done(null,new Error('Google script tag rejected'));
      tag.src=url+sep+'callback='+encodeURIComponent(callback);
      document.head.appendChild(tag);
    });
  }

  function firstAvailable(tasks) {
    return new Promise((resolve,reject)=>{
      if(!tasks.length){reject(new Error('No photo feeds configured'));return;}
      let remaining=tasks.length;
      const failed=[];
      tasks.forEach(task=>Promise.resolve().then(task).then(resolve,err=>{
        failed.push(err);
        if(--remaining===0) {
          const problem=new Error('No photo source is reachable');
          problem.causes=failed;
          reject(problem);
        }
      }));
    });
  }

  // The V24 client launched THREE simultaneous requests into one slow Google
  // Apps Script. This amplified Drive scanning and often made timeouts worse.
  // Use one Vercel relay request; fall back to read-only JSONP only after failure.
  async function getLivePhotos(opts) {
    const errors=[];
    if(opts.feedUrl) {
      try{return await loadFeed(opts.feedUrl,20000);}catch(e){errors.push(e);}
    }
    let fallbackScript=opts.jsonpFeedUrl||null;
    // The real URL is set in Vercel's SOFIRE_GOOGLE_PHOTO_FEED_URL,
    // not hardcoded to the separate Tankwa site's older Apps Script.
    if(!fallbackScript&&opts.feedUrl) {
      try {
        const configUrl=opts.feedUrl+(opts.feedUrl.includes('?')?'&':'?')+'config=1';
        const response=await fetch(configUrl,{cache:'no-store'});
        if(response.ok){const config=await response.json();fallbackScript=config.jsonpFeedUrl||null;}
      }catch(_){ /* relay may be fully offline */ }
    }
    if(fallbackScript) {
      try{return await loadJsonp(fallbackScript,13000);}catch(e){errors.push(e);}
    }
    if(!errors.length)throw new Error('No photo feed configured');
    const exception=new Error('Photo feed could not be reached');
    exception.causes=errors;
    throw exception;
  }

  function readLastGood() {
    try {
      const saved=JSON.parse(localStorage.getItem(galleryCacheKey)||'null');
      if(!saved||!Array.isArray(saved.items)||Date.now()-saved.time>90*24*60*60*1000)return null;
      const photos=parseFeed(saved.items);
      return photos.length>0?photos:null;
    }catch(_){return null;}
  }
  function writeLastGood(photos) {
    try {
      const items=photos.slice(0,2500).map(p=>p.sourceItem);
      localStorage.setItem(galleryCacheKey,JSON.stringify({time:Date.now(),items}));
    }catch(_){/* localStorage disabled/full; animation still works */}
  }

  function failureCode(err) {
    const causes=err&&err.causes||[err];
    const chosen=causes.find(e=>e&&e.code&&e.code!=='HTTP_404')||causes.find(e=>e&&e.code);
    return chosen&&chosen.code||'GOOGLE_FEED_BLOCKED';
  }

  function mount(opts) {
    const track=document.getElementById(opts.trackId);
    if (!track) throw new Error('Memory Reel strip not found: '+opts.trackId);
    const hero=opts.heroId?document.getElementById(opts.heroId):null;
    const status=opts.statusId?document.getElementById(opts.statusId):null;
    const backup=parseFeed(opts.fallback||[]);
    if (!backup.length) throw new Error('No backup images supplied');
    let activeSet='', liveCount=0, strip=null, slide=null, syncing=false, online=false, localCount=0;
    let refreshHandle=0;
    const debug={source:'saved',photos:backup.length,changes:[]};
    function report(str) { if (status) status.textContent=str; }
    function show(photos,source) {
      const signature=photos.map(p=>p.key).sort().join('|');
      if(signature===activeSet)return;
      if(strip)strip.stop(); if(slide)slide.stop();
      activeSet=signature;
      debug.source=source;debug.photos=photos.length;
      strip=buildStrip(track,photos,opts);
      slide=buildHero(hero,photos,Object.assign({},opts,{onHeroChange:key=>{debug.changes.push(key);if(debug.changes.length>300)debug.changes.shift();}}));
    }
    show(backup,'saved');
    let rememberedCount=0;
    // Last-known-good manifest survives a temporary Google or Vercel outage,
    // including a TV browser restart. No photos are uploaded from this browser.
    const remembered=opts.feedUrl?readLastGood():null;
    if(remembered && remembered.length) {
      rememberedCount=remembered.length;
      show(remembered,'last-known-good');
    }
    // A locally bundled copy of original photos works even when Drive is down.
    // The manifest is empty until the owner supplies true original image files.
    async function localGallery() {
      if(!opts.originalsManifestUrl)return;
      try {
        const response=await fetch(opts.originalsManifestUrl,{cache:'no-store'});
        if(!response.ok)return;
        const photos=parseFeed(await response.json());
        if(photos.length && !online) {
          localCount=photos.length;
          show(photos,'local-originals');
          report('Original photo library · '+photos.length+' photos · shuffled');
        }
      }catch (_) { /* Optional pack: never block the reel */ }
    }
    localGallery();
    const shouldConnect=!!(opts.feedUrl||opts.directFeedUrl||opts.jsonpFeedUrl);
    report(shouldConnect?(rememberedCount?'Saved gallery · '+rememberedCount+' photos · reconnecting':'Connecting to Google Drive… · '+backup.length+' saved photos'):'Offline · '+backup.length+' saved photos');
    async function sync() {
      if(!shouldConnect||syncing)return;
      syncing=true;
      const watchdog=setTimeout(()=>{
        if(!online&&syncing)report('Google Drive response delayed · '+backup.length+' backups · V23');
      },12000);
      try {
        const feed=await getLivePhotos(opts);
        const live=feed.photos;
        if(!live.length)throw new Error('Photo feed returned no image URLs');
        // V22 tested up to ten photographs sequentially and could stall for
        // minutes. Verify a few independent originals concurrently (<4 sec).
        const samples=shuffle(live.slice()).slice(0,Math.min(3,live.length));
        const checks=await Promise.all(samples.map(p=>bestForHero(p,2048,4200)));
        if(!checks.some(Boolean)){
          const error=new Error('Google Drive returned links that the TV browser cannot display');
          error.code='PHOTO_IMAGES_NOT_PUBLIC';
          throw error;
        }
        liveCount=live.length;online=true;
        writeLastGood(live);
        show(live,feed.mode==='cached'?'cached':'google-drive');
        report((feed.mode==='cached'?'Last synced Drive gallery':'Google Drive live')+' · '+live.length+' distinct photos · shuffled');
        debug.lastError=feed.warningCode||null;
      } catch(err) {
        console.warn('[Memory Reel V24] Gallery not available:',err);
        const code=failureCode(err);
        debug.lastError=code;
        if(online)report('Drive reconnecting · '+liveCount+' photos retained · '+code);
        else if(rememberedCount)report('Saved Drive gallery · '+rememberedCount+' photos · retrying · '+code);
        else if(localCount)report('Original photo library · '+localCount+' photos · Drive '+code);
        else report('Drive unavailable · '+backup.length+' saved photos · '+code);
      } finally {clearTimeout(watchdog);syncing=false;}
    }
    if(shouldConnect) {
      sync();
      refreshHandle=setInterval(sync,Math.max(30000,Number(opts.refreshEveryMs)||90000));
    }
    return {
      get photoCount(){return debug.photos;},
      get source(){return debug.source;},
      get heroHistory(){return debug.changes.slice();},
      refresh:sync,
      stop(){if(strip)strip.stop();if(slide)slide.stop();clearInterval(refreshHandle);}
    };
  }
  window.StillOnFireReel={mount,parseFeed,createDeck,imageVariant,version:"25"};
})();
