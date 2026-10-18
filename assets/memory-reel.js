/* Still On Fire | V22 - direct Tankwa-style Google Apps Script feed + TV-quality shuffle.
   The public Google Apps Script returns display-ready photo URLs. Keep those URLs:
   never replace them with drive.google.com/thumbnail links guessed from a Drive ID.
   Shuffle distinct photos without repeating until a complete deck has been shown.
*/
(function () {
  'use strict';

  const storedPrefix = 'sofire-v22-last:';
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

  function itemToPhoto(item) {
    const obj = item && typeof item === 'object' && !Array.isArray(item) ? item : null;
    if (obj && obj.mimeType && !/^image\//i.test(obj.mimeType)) return null;
    let url = typeof item === 'string' ? item : obj && (
      obj.url || obj.src || obj.downloadUrl || obj.imageUrl || obj.originalUrl ||
      obj.fullSizeUrl || obj.thumbnailUrl || obj.thumbnailLink || obj.photoUrl ||
      obj.webContentLink || obj.link
    );
    // Some feeds supply only a file ID; use a thumbnail URL in that case only.
    if (!url && obj && /^[A-Za-z0-9_-]{20,}$/.test(String(obj.fileId || obj.id || '')))
      url = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(obj.fileId || obj.id) + '&sz=w2400';
    if (typeof url !== 'string' || !url.trim()) return null;
    url = url.trim();
    if (!/^(?:https?:\/\/|\.\.?\/|assets\/|data:image\/(?:jpeg|png|webp|gif);base64,)/i.test(url)) return null;
    const hash = obj && (obj.md5Checksum || obj.sha256Checksum);
    const key = hash ? 'hash:' + hash : sourceKey(url, obj);
    return {
      key, url,
      // Try a high-resolution photo FIRST; revert to the untouched working
      // source URL if Google's image service does not support larger sizes.
      fullCandidates(width) {
        const preferred = width >= 2500 ? [3200,2400,1600] : [2400,1600];
        return [...new Set(preferred.map(w => imageVariant(url,w)).concat(url))];
      },
      thumbCandidates() { return [...new Set([imageVariant(url,1100), url])]; }
    };
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
    for (const url of candidates) {
      const loaded = await loadPhoto(url,timeoutMs);
      if (loaded) return loaded;
    }
    return null;
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
        const result = await firstWorking(candidate.fullCandidates(want),7500);
        if (!running) return;
        if (result) { loaded=result; photo=candidate; break; }
      }
      if (loaded && running) {
        img.src = loaded.src;
        img.dataset.photoKey = photo.key;
        img.dataset.photoWidth = String(loaded.width);
        img.dataset.photoHeight = String(loaded.height);
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
    const alarm=setTimeout(()=>controller.abort(),timeoutMs||15000);
    try {
      const res=await fetch(url,{cache:'no-store',signal:controller.signal,redirect:'follow'});
      if(!res.ok)throw new Error('Feed HTTP '+res.status);
      const json=await res.json();
      return parseFeed(json);
    } finally {clearTimeout(alarm);}
  }

  function mount(opts) {
    const track=document.getElementById(opts.trackId);
    if (!track) throw new Error('Memory Reel strip not found: '+opts.trackId);
    const hero=opts.heroId?document.getElementById(opts.heroId):null;
    const status=opts.statusId?document.getElementById(opts.statusId):null;
    const backup=parseFeed(opts.fallback||[]);
    if (!backup.length) throw new Error('No backup images supplied');
    let activeSet='', liveCount=0, strip=null, slide=null, syncing=false, online=false;
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
    report(opts.feedUrl?'Connecting to photos… · '+backup.length+' saved backups':'Offline · '+backup.length+' HD photos');
    async function sync() {
      if(!opts.feedUrl||syncing)return;
      syncing=true;
      try {
        const live=await loadFeed(opts.feedUrl,14000);
        if(!live.length)throw new Error('Photo feed returned no image URLs');
        // Crucial difference from V21: do not rewrite Drive links and reject
        // the entire collection after probing every thumbnail. Only verify one
        // usable image before switching to the full feed.
        let usable=null;
        const candidates=shuffle(live.slice()).slice(0,Math.min(10,live.length));
        for (const photo of candidates) {
          usable=await firstWorking(photo.fullCandidates(2048),4000);
          if(usable)break;
        }
        if(!usable)throw new Error('Feed has '+live.length+' photos but the image links cannot load');
        liveCount=live.length;online=true;
        show(live,'google-drive');
        report('Google Drive live · '+live.length+' distinct photos · shuffled');
      } catch(err) {
        console.warn('[Memory Reel] Direct Google feed unavailable:',err);
        if(online)report('Drive reconnecting · '+liveCount+' photos retained');
        else report('Drive unavailable · showing '+backup.length+' saved HD photos');
      } finally {syncing=false;}
    }
    if(opts.feedUrl) {
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
  window.StillOnFireReel={mount,parseFeed,createDeck,imageVariant};
})();
