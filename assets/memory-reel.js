/* Still On Fire | V21 HD-TV Memory Reel
   - One shuffled, no-repeat deck per display; newly shuffled after a full cycle.
   - Google Drive's low-resolution thumbnail links are upgraded for the main photo.
   - Saved photographs are backups, NOT extra copies of photos in a live feed.
   - A filmstrip uses lightweight thumbs; the hero loads and decodes higher-resolution photos.
   - Never crop photos and never insert feed-provided HTML into the page.
*/
(function () {
  'use strict';

  const ID_PATTERN = /^[a-zA-Z0-9_-]{20,}$/;
  const SIZES = [4096, 3200, 2560, 2048, 1600];
  const verifiedImages = new Map();

  function fisherYates(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function getLast(key) {
    try { return sessionStorage.getItem('sofire-hd-last:' + key); }
    catch (_) { return null; }
  }
  function saveLast(key, photoKey) {
    try { sessionStorage.setItem('sofire-hd-last:' + key, photoKey); }
    catch (_) { /* Offline files can have restricted storage. */ }
  }

  function deckFor(photos, storageKey) {
    let remaining = [];
    let last = getLast(storageKey);
    return {
      next(avoid) {
        if (!remaining.length) {
          remaining = fisherYates(photos.slice());
          // The final picture in the old deck may not be the first of the new deck.
          if (remaining.length > 1 && remaining[0].key === last) {
            const swapAt = 1 + Math.floor(Math.random() * (remaining.length - 1));
            [remaining[0], remaining[swapAt]] = [remaining[swapAt], remaining[0]];
          }
        }
        // Prefer an image not already on screen, without discarding other
        // photographs from this no-repeat cycle.
        if (avoid && remaining.length > 1) {
          const index = remaining.findIndex(candidate => !avoid.has(candidate.key) && candidate.key !== last);
          if (index > 0) [remaining[0], remaining[index]] = [remaining[index], remaining[0]];
        }
        const photo = remaining.shift();
        if (photo) { last = photo.key; saveLast(storageKey, last); }
        return photo;
      }
    };
  }

  function driveId(value) {
    if (typeof value !== 'string') return null;
    const input = value.trim();
    if (ID_PATTERN.test(input)) return input;
    try {
      const url = new URL(input, window.location.href);
      const host = url.hostname.toLowerCase();
      if (host === 'drive.google.com' || host === 'docs.google.com') {
        const fromPath = url.pathname.match(/\/(?:file\/d|document\/d|spreadsheets\/d|presentation\/d)\/([\w-]{20,})/);
        if (fromPath) return fromPath[1];
        const id = url.searchParams.get('id');
        if (id && ID_PATTERN.test(id)) return id;
      }
      if (/^(?:lh\d+\.)?googleusercontent\.com$/.test(host)) {
        const fromPath = url.pathname.match(/^\/d\/([\w-]{20,})(?:=|\/|$)/);
        if (fromPath) return fromPath[1];
      }
    } catch (_) { /* Other URLs are still allowed below. */ }
    return null;
  }

  function driveThumbnail(id, size) {
    return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + size;
  }

  function replaceGoogleImageSize(url, width) {
    // Handles ordinary Google Photos / googleusercontent image URLs.
    return url.replace(/=(?:w\d+(?:-h\d+)?|s\d+)(?:-[a-z0-9-]+)*$/i, '=w' + width);
  }

  function cleanIdentity(url) {
    try {
      const parsed = new URL(url, window.location.href);
      ['sz', 'w', 'width', 'height', 't', 'ts', 'cache', 'cachebuster'].forEach(key => parsed.searchParams.delete(key));
      return (parsed.origin + parsed.pathname + parsed.search).replace(/=(?:w\d+(?:-h\d+)?|s\d+)(?:-[a-z0-9-]+)*$/i, '');
    } catch (_) { return url; }
  }

  function fromSource(source, metadata) {
    if (!source || typeof source !== 'string') return null;
    source = source.trim();
    if (!source || !/^(?:https?:\/\/|\.\.?\/|assets\/|data:image\/(?:jpeg|png|webp|gif);base64,)/i.test(source) && !ID_PATTERN.test(source)) return null;
    const id = driveId(metadata && (metadata.fileId || metadata.driveId || metadata.id)) || driveId(source);
    const md5 = metadata && (metadata.md5Checksum || metadata.sha256Checksum || metadata.contentHash);
    const filename = metadata && (metadata.name || metadata.filename);
    const fileSize = metadata && (metadata.size || metadata.fileSize);
    const identity = typeof md5 === 'string' && md5.length > 12 ? 'hash:' + md5 :
      filename && fileSize ? 'filename:' + String(filename).toLowerCase() + ':' + fileSize :
      id ? 'drive:' + id : 'url:' + cleanIdentity(source);

    if (id) {
      return {
        key:identity, source:'drive',
        thumb:driveThumbnail(id, 1200),
        heroCandidates(width) {
          const wanted = width >= 2700 ? 4096 : width >= 1900 ? 3200 : 2560;
          return [...new Set([wanted, ...SIZES.filter(n => n < wanted)])].map(n => driveThumbnail(id, n));
        }
      };
    }

    // Do not preserve a w200/s320 thumbnail as the hero: request larger variants.
    if (/^https?:\/\/[^/]*googleusercontent\.com\//i.test(source) && /=(?:w\d+|s\d+)/i.test(source)) {
      return {
        key:identity, source:'googleusercontent', thumb:replaceGoogleImageSize(source, 1000),
        heroCandidates(width) {
          const wanted = width >= 2700 ? 4096 : width >= 1900 ? 3200 : 2560;
          return [...new Set([wanted, 2048, 1600])].map(n => replaceGoogleImageSize(source, n));
        }
      };
    }
    return { key:identity, source:'url', thumb:source, heroCandidates() { return [source]; } };
  }

  function normalizeItem(item) {
    if (typeof item === 'string') return fromSource(item, null);
    if (!item || typeof item !== 'object') return null;
    if (item.mimeType && !String(item.mimeType).startsWith('image/')) return null;
    const link = item.originalUrl || item.fullSizeUrl || item.imageUrl || item.url || item.src ||
      item.photoUrl || item.downloadUrl || item.webContentLink || item.thumbnailUrl ||
      item.thumbnailLink || item.image || item.link;
    return fromSource(link || (ID_PATTERN.test(String(item.fileId || item.id || '')) ? String(item.fileId || item.id) : null), item);
  }

  function parseFeed(payload) {
    let list = null;
    if (Array.isArray(payload)) list = payload;
    if (!list && payload && typeof payload === 'object') {
      list = [payload.images, payload.photos, payload.items, payload.files, payload.results,
        payload.data, payload.data && payload.data.images, payload.data && payload.data.photos,
        payload.data && payload.data.items, payload.data && payload.data.files].find(Array.isArray);
    }
    if (!list) return [];
    const unique = new Map();
    for (const item of list) {
      const photo = normalizeItem(item);
      if (photo && !unique.has(photo.key)) unique.set(photo.key, photo);
    }
    return [...unique.values()];
  }

  function loadImage(url, timeoutMs) {
    return new Promise(resolve => {
      const image = new Image();
      image.decoding = 'async';
      let finished = false;
      function done(ok) {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        image.onload = image.onerror = null;
        resolve(ok ? { url, width:image.naturalWidth, height:image.naturalHeight, image } : null);
      }
      const timeout = setTimeout(() => done(false), timeoutMs);
      image.onload = () => done(image.naturalWidth > 0 && image.naturalHeight > 0);
      image.onerror = () => done(false);
      image.src = url;
    });
  }

  async function chooseImage(photo, pixelWidth, timeoutMs) {
    const candidates = [...new Set([...photo.heroCandidates(pixelWidth), photo.thumb])];
    for (const url of candidates) {
      const loaded = await loadImage(url, timeoutMs);
      if (loaded) {
        try { if (loaded.image.decode) await loaded.image.decode(); }
        catch (_) { /* Decoding completes automatically in all modern browsers. */ }
        return loaded;
      }
    }
    return null;
  }

  function buildHero(img, photos, options) {
    if (!img) return { stop() {} };
    const deck = deckFor(photos, options.key + ':hero');
    let active = true;
    let timer = null;
    let version = 0;
    const interval = Math.max(2200, options.heroInterval || 7000);
    img.decoding = 'async';
    img.loading = 'eager';
    img.setAttribute('fetchpriority', 'high');
    img.style.objectFit = 'contain';
    img.style.filter = 'none';
    img.style.transform = 'none';

    function visibleStripKeys() {
      const strip = document.getElementById(options.trackId);
      if (!strip || !strip.parentElement) return new Set();
      const bounds = strip.parentElement.getBoundingClientRect();
      const used = new Set();
      for (const frame of strip.children) {
        const position = frame.getBoundingClientRect();
        if (position.right > bounds.left + 20 && position.left < bounds.right - 20) used.add(frame.dataset.photoKey);
      }
      return used;
    }
    async function next() {
      if (!active) return;
      if (document.hidden) { timer = setTimeout(next, 1200); return; }
      const token = ++version;
      // HDTV screens typically need 2K; native 4K screens request up to 4096px.
      const desired = Math.max((img.clientWidth || 1100) * (window.devicePixelRatio || 1),
        window.innerWidth >= 2400 ? 3200 : 2048);
      let selected = null, photo = null;
      for (let tries = 0; tries < photos.length && active; tries++) {
        const candidate = deck.next(visibleStripKeys());
        const loaded = await chooseImage(candidate, desired, 9500);
        if (token !== version || !active) return;
        if (loaded) { photo = candidate; selected = loaded; break; }
      }
      if (selected && active) {
        img.src = selected.url;
        img.dataset.photoKey = photo.key;
        img.dataset.sourceWidth = String(selected.width);
        img.dataset.sourceHeight = String(selected.height);
        img.style.visibility = 'visible';
      }
      timer = setTimeout(next, selected ? interval : 4000);
    }
    // First load has no hard-coded photo. When the live feed becomes available,
    // keep showing the saved picture until the new HD image has decoded.
    if (!img.dataset.photoKey) img.removeAttribute('src');
    next();
    return {
      stop() { active = false; ++version; clearTimeout(timer); }
    };
  }

  function buildStrip(track, photos, options) {
    const parent = track.parentElement;
    const deck = deckFor(photos, options.key + ':strip');
    let alive = true;
    let animation = 0, lastFrame = 0, offset = 0, batchSize = 0, cycleWidth = 0;
    let playing = true;
    const speed = Number(options.speed) || 19;
    const pauseOnHover = options.pauseOnHover === true;

    function newFrame(photo) {
      const box = document.createElement('div');
      box.className = options.frameClass;
      box.dataset.photoKey = photo.key;
      const img = document.createElement('img');
      img.alt = 'Family memory';
      img.decoding = 'async';
      img.loading = 'eager';
      img.style.objectFit = 'contain';
      img.style.filter = 'none';
      img.addEventListener('error', () => {
        // High-res backup for feeds whose thumbnail route is unavailable.
        if (img.dataset.retry !== '1') { img.dataset.retry = '1'; img.src = photo.heroCandidates(1600).slice(-1)[0]; }
        else img.style.visibility = 'hidden';
      });
      img.src = photo.thumb;
      box.appendChild(img);
      return box;
    }

    function append(size) {
      const fragment = document.createDocumentFragment();
      const main = document.getElementById(options.heroId || '');
      const avoid = main && main.dataset.photoKey ? new Set([main.dataset.photoKey]) : null;
      for (let i = 0; i < size; i++) fragment.appendChild(newFrame(deck.next(avoid)));
      track.appendChild(fragment);
    }

    function measureWidth() {
      if (!track.children[batchSize]) return 0;
      const first = track.firstElementChild;
      const second = track.children[batchSize];
      return second.getBoundingClientRect().left - first.getBoundingClientRect().left;
    }

    function setup() {
      const measure = document.createElement('div');
      measure.className = options.frameClass;
      track.replaceChildren(measure);
      const width = measure.getBoundingClientRect().width || 280;
      const style = getComputedStyle(track);
      const gap = parseFloat(style.gap) || 0;
      const needed = Math.ceil((parent.clientWidth + width) / (width + gap)) + 1;
      batchSize = Math.max(2, needed, Math.min(photos.length, 10));
      track.replaceChildren();
      append(batchSize);
      append(batchSize);
      offset = 0;
      track.style.transform = 'translate3d(0px,0,0)';
      cycleWidth = measureWidth();
      lastFrame = 0;
    }

    function tick(time) {
      if (!alive) return;
      const elapsed = lastFrame ? Math.min(time - lastFrame, 70) / 1000 : 0;
      lastFrame = time;
      if (playing && !document.hidden && cycleWidth > 0) {
        offset -= speed * elapsed;
        while (offset <= -cycleWidth) {
          offset += cycleWidth;
          for (let i = 0; i < batchSize; i++) track.firstElementChild.remove();
          append(batchSize); // Continue the no-repeat deck, not a cloned static batch.
          cycleWidth = measureWidth();
        }
        track.style.transform = 'translate3d(' + offset + 'px,0,0)';
      }
      animation = requestAnimationFrame(tick);
    }

    function pause() { playing = false; }
    function resume() { playing = true; lastFrame = 0; }
    function resize() { if (alive) setup(); }
    setup();
    if (pauseOnHover) {
      parent.addEventListener('mouseenter', pause);
      parent.addEventListener('mouseleave', resume);
      parent.addEventListener('touchstart', pause, { passive:true });
      parent.addEventListener('touchend', resume, { passive:true });
      parent.addEventListener('touchcancel', resume, { passive:true });
    }
    window.addEventListener('resize', resize);
    animation = requestAnimationFrame(tick);
    return { stop() {
      alive = false;
      cancelAnimationFrame(animation);
      window.removeEventListener('resize', resize);
      if (pauseOnHover) {
        parent.removeEventListener('mouseenter', pause);
        parent.removeEventListener('mouseleave', resume);
        parent.removeEventListener('touchstart', pause);
        parent.removeEventListener('touchend', resume);
        parent.removeEventListener('touchcancel', resume);
      }
    }};
  }

  async function loadFeed(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {cache:'no-store', signal:controller.signal});
      if (!response.ok) throw new Error('Google photo feed HTTP ' + response.status);
      return parseFeed(await response.json());
    } finally { clearTimeout(timeout); }
  }

  async function liveImages(photos) {
    const results = new Array(photos.length).fill(false);
    let nextIndex = 0;
    const workers = Array.from({length:Math.min(10, photos.length)}, async () => {
      while (nextIndex < photos.length) {
        const index = nextIndex++;
        const item = photos[index];
        const known = verifiedImages.get(item.key);
        if (known && Date.now() - known.checked < 15 * 60 * 1000) {
          results[index] = known.ok;
          continue;
        }
        let loaded = await loadImage(item.thumb, 6500);
        if (!loaded) loaded = await loadImage(item.heroCandidates(1600).slice(-1)[0], 6500);
        const ok = !!loaded;
        verifiedImages.set(item.key, {ok, checked:Date.now()});
        results[index] = ok;
      }
    });
    await Promise.all(workers);
    return photos.filter((_,i) => results[i]);
  }

  function mount(settings) {
    const track = document.getElementById(settings.trackId);
    if (!track) return;
    const hero = settings.heroId ? document.getElementById(settings.heroId) : null;
    const status = settings.statusId ? document.getElementById(settings.statusId) : null;
    const saved = parseFeed(settings.fallback || []);
    if (!saved.length) throw new Error('The memory reel needs at least one saved photo.');
    let current = '', strip = null, slide = null, syncing = false;
    let liveCount = 0;

    function report(message) { if (status) status.textContent = message; }
    function show(photos) {
      // Replacement rather than concatenation prevents duplicate saved / Drive photographs.
      if (!photos.length) return;
      const signature = photos.map(item => item.key).sort().join('\n');
      if (signature === current) return;
      if (strip) strip.stop();
      if (slide) slide.stop();
      strip = buildStrip(track, photos, settings);
      slide = buildHero(hero, photos, settings);
      current = signature;
    }

    show(saved);
    report(settings.feedUrl ? saved.length + ' saved memories · checking Drive' : 'Offline reel · ' + saved.length + ' photos');

    async function sync() {
      if (!settings.feedUrl || syncing) return;
      syncing = true;
      try {
        let source;
        try { source = await loadFeed(settings.feedUrl); }
        catch (primaryError) {
          if (!settings.feedFallbackUrl) throw primaryError;
          source = await loadFeed(settings.feedFallbackUrl);
        }
        if (!source.length) throw new Error('The photo feed returned no images.');
        const working = await liveImages(source);
        if (working.length < 3) {
          if (liveCount) report('Live · ' + liveCount + ' photos · Drive has only ' + working.length + ' now');
          else report('Saved · ' + saved.length + ' photos · only ' + working.length + ' usable on Drive');
          return;
        }
        liveCount = working.length;
        show(working); // Live feed takes precedence over saved fallbacks. Never double-up.
        report('Live · ' + working.length + ' distinct photos');
      } catch (error) {
        console.warn('[Still On Fire TV reel] Google Drive sync:', error);
        if (!liveCount) report('Saved only · ' + saved.length + ' photos · Drive unavailable');
        else report('Live · ' + liveCount + ' photos · retrying Drive');
      } finally { syncing = false; }
    }
    if (settings.feedUrl) {
      sync();
      if (settings.refreshEveryMs) window.setInterval(sync, Math.max(30000, settings.refreshEveryMs));
    }
    return {get photoCount(){return liveCount || saved.length;}, get liveCount(){return liveCount;}};
  }

  window.StillOnFireReel = {mount, parseFeed, deckFor};
})();
