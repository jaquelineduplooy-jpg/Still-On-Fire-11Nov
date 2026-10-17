/* Still On Fire | Memory Reel repair
   A shared, crop-free, resilient photo reel for the invitation, live screen and offline screen.
   Photo URLs are treated as data, never inserted as HTML. */
(function () {
  'use strict';

  function uniquePhotos(values) {
    const seen = new Set();
    return values.map(value => String(value || '').trim()).filter(value => {
      if (!value || !/^(?:https?:\/\/|\.\.?\/|assets\/|data:image\/(?:jpeg|png|gif|webp);base64,)/i.test(value) || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function shuffleInPlace(values) {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }

  function savedFirst(key) {
    try { return window.sessionStorage.getItem('sofire-reel-first:' + key); }
    catch (_) { return null; }
  }

  function rememberFirst(key, value) {
    try { window.sessionStorage.setItem('sofire-reel-first:' + key, value); }
    catch (_) { /* Browsers may restrict storage for local offline files. */ }
  }

  // Every photograph is visited before the deck repeats. The next deck is reshuffled.
  function photoDeck(photos, key) {
    let cards = [], position = 0, last = null, firstDraw = true;
    function refresh() {
      cards = shuffleInPlace(photos.slice());
      const avoid = firstDraw ? savedFirst(key) : last;
      if (cards.length > 1 && cards[0] === avoid) {
        const j = 1 + Math.floor(Math.random() * (cards.length - 1));
        [cards[0], cards[j]] = [cards[j], cards[0]];
      }
      position = 0;
    }
    return {
      next() {
        if (position >= cards.length) refresh();
        const photo = cards[position++];
        if (firstDraw) { rememberFirst(key, photo); firstDraw = false; }
        last = photo;
        return photo;
      }
    };
  }

  function createStrip(track, photos, settings) {
    const frameClass = settings.frameClass;
    const deck = photoDeck(photos, settings.key + ':strip');
    const fallback = settings.fallback;
    let playing = true, destroyed = false, frameId = null, lastTime = 0, translate = 0;
    let batchSize = 0, loopWidth = 0;
    let current = [], following = [];
    const pixelSpeed = settings.speed || 19; // Original gentle film-reel tempo, measured in px/sec.
    let fallbackIndex = 0;
    const parent = track.parentElement;

    function frame(src) {
      const outer = document.createElement('div');
      outer.className = frameClass;
      const photo = document.createElement('img');
      photo.alt = 'Family memory';
      photo.decoding = 'async';
      photo.loading = 'eager';
      photo.addEventListener('error', () => {
        if (photo.dataset.retry === '1') { photo.style.visibility = 'hidden'; return; }
        photo.dataset.retry = '1';
        const safePhoto = fallback[fallbackIndex++ % fallback.length];
        photo.src = safePhoto;
      });
      photo.src = src;
      outer.appendChild(photo);
      return outer;
    }

    function appendFrames(items) {
      const fragment = document.createDocumentFragment();
      items.forEach(url => fragment.appendChild(frame(url)));
      track.appendChild(fragment);
    }

    function nextBatch() {
      return Array.from({ length: batchSize }, () => deck.next());
    }

    function widthForBatch() {
      const first = track.children[0], after = track.children[batchSize];
      if (!first || !after) return 0;
      // CSS gap and responsive frame widths are included in this real DOM measurement.
      return after.getBoundingClientRect().left - first.getBoundingClientRect().left;
    }

    function initialize() {
      const test = frame(photos[0]);
      track.replaceChildren(test);
      const frameWidth = test.getBoundingClientRect().width || 220;
      const layoutStyle = window.getComputedStyle(track);
      const gap = Number.parseFloat(layoutStyle.columnGap || layoutStyle.gap) || 0;
      // The next batch covers the window before we discard the prior one.
      const minimum = Math.ceil((parent.clientWidth + frameWidth) / (frameWidth + gap)) + 1;
      batchSize = Math.max(2, minimum, Math.min(photos.length, 10));
      current = nextBatch();
      following = nextBatch();
      track.replaceChildren();
      appendFrames(current);
      appendFrames(following);
      translate = 0;
      track.style.transform = 'translate3d(0px,0,0)';
      loopWidth = widthForBatch();
    }

    function moveFrame(time) {
      if (destroyed) return;
      const elapsed = lastTime ? Math.min(time - lastTime, 80) / 1000 : 0;
      lastTime = time;
      if (playing && !document.hidden && loopWidth > 0) {
        translate -= elapsed * pixelSpeed;
        while (translate <= -loopWidth) {
          translate += loopWidth;
          for (let i = 0; i < batchSize; i++) track.firstElementChild.remove();
          current = following;
          following = nextBatch(); // Fresh photos, not a repeated fixed sequence.
          appendFrames(following);
          loopWidth = widthForBatch();
        }
        track.style.transform = `translate3d(${translate}px,0,0)`;
      }
      frameId = window.requestAnimationFrame(moveFrame);
    }

    function pause() { playing = false; }
    function resume() { playing = true; lastTime = 0; }
    function resize() {
      if (destroyed) return;
      const child = track.firstElementChild;
      if (!child) return;
      const computed = window.getComputedStyle(track);
      const gap = Number.parseFloat(computed.columnGap || computed.gap) || 0;
      const minFrames = Math.ceil((parent.clientWidth + child.getBoundingClientRect().width) / (child.getBoundingClientRect().width + gap)) + 1;
      if (minFrames > batchSize) initialize();
      else loopWidth = widthForBatch();
      lastTime = 0;
    }

    initialize();
    parent.addEventListener('mouseenter', pause);
    parent.addEventListener('mouseleave', resume);
    parent.addEventListener('touchstart', pause, { passive: true });
    parent.addEventListener('touchend', resume, { passive: true });
    parent.addEventListener('touchcancel', resume, { passive: true });
    window.addEventListener('resize', resize);
    frameId = window.requestAnimationFrame(moveFrame);
    return {
      stop() {
        destroyed = true;
        if (frameId !== null) window.cancelAnimationFrame(frameId);
        window.removeEventListener('resize', resize);
        parent.removeEventListener('mouseenter', pause);
        parent.removeEventListener('mouseleave', resume);
        parent.removeEventListener('touchstart', pause);
        parent.removeEventListener('touchend', resume);
        parent.removeEventListener('touchcancel', resume);
      }
    };
  }

  function createHero(hero, photos, settings) {
    if (!hero) return { stop() {} };
    const deck = photoDeck(photos, settings.key + ':hero');
    let last = '', active = true;
    function change() {
      if (!active || document.hidden) return;
      hero.dataset.retry = '0';
      hero.style.visibility = 'visible';
      let src = deck.next();
      if (src === last && photos.length > 1) src = deck.next();
      last = src;
      hero.src = src;
    }
    hero.onerror = function () {
      if (hero.dataset.retry === '1') { hero.style.visibility = 'hidden'; return; }
      hero.dataset.retry = '1';
      hero.src = settings.fallback[Math.floor(Math.random() * settings.fallback.length)];
    };
    hero.dataset.retry = '0';
    hero.style.visibility = 'visible';
    change();
    const timer = window.setInterval(change, settings.heroInterval || 5600);
    return { stop() { active = false; window.clearInterval(timer); hero.onerror = null; } };
  }

  function fromDriveId(id) {
    return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1600';
  }

  function normalizeDriveLink(value) {
    const filePath = value.match(/^https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{20,})/i);
    if (filePath) return fromDriveId(filePath[1]);
    const ucLink = value.match(/^https?:\/\/drive\.google\.com\/(?:open|uc)\?/i);
    if (ucLink) {
      try { const id = new URL(value).searchParams.get('id'); if (id) return fromDriveId(id); }
      catch (_) {}
    }
    return value;
  }

  function itemUrl(item) {
    if (typeof item === 'string') {
      const value = item.trim();
      return /^[a-zA-Z0-9_-]{24,}$/.test(value) ? fromDriveId(value) : normalizeDriveLink(value);
    }
    if (!item || typeof item !== 'object') return null;
    const source = item.url || item.src || item.imageUrl || item.thumbnailUrl || item.thumbnailLink || item.downloadUrl || item.webContentLink || item.photoUrl || item.image || item.link;
    if (typeof source === 'string') return itemUrl(source);
    return item.id || item.fileId ? fromDriveId(String(item.id || item.fileId)) : null;
  }

  function parseFeed(json) {
    if (Array.isArray(json)) return uniquePhotos(json.map(itemUrl));
    if (!json || typeof json !== 'object') return [];
    const arrays = [json.images, json.photos, json.items, json.files, json.results, json.data, json.data && json.data.images, json.data && json.data.photos, json.data && json.data.items].filter(Array.isArray);
    return uniquePhotos((arrays[0] || []).map(itemUrl));
  }

  async function fetchFeed(feedUrl) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(feedUrl, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Photo feed returned HTTP ' + response.status);
      return parseFeed(await response.json());
    } finally { window.clearTimeout(timer); }
  }

  function checkImage(url, timeoutMs) {
    return new Promise(resolve => {
      const img = new Image();
      let done = false;
      function finish(valid) {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        resolve(valid);
      }
      const timer = window.setTimeout(() => finish(false), timeoutMs);
      img.onload = () => finish(img.naturalWidth > 0);
      img.onerror = () => finish(false);
      img.src = url;
    });
  }

  // Do not put unopenable Google Drive links in the reel. Show saved images meanwhile.
  async function workingImages(urls) {
    const checked = new Array(urls.length).fill(false);
    let next = 0;
    const workers = Array.from({ length: Math.min(8, urls.length) }, async () => {
      while (next < urls.length) {
        const index = next++;
        checked[index] = await checkImage(urls[index], 7500);
      }
    });
    await Promise.all(workers);
    return urls.filter((_, index) => checked[index]);
  }

  function mount(settings) {
    const track = document.getElementById(settings.trackId);
    if (!track) return;
    const hero = settings.heroId ? document.getElementById(settings.heroId) : null;
    const status = settings.statusId ? document.getElementById(settings.statusId) : null;
    const fallback = uniquePhotos(settings.fallback || []);
    if (!fallback.length) throw new Error('Memory reel needs at least one local photograph.');
    const options = { ...settings, fallback };
    let strip = null, heroSlide = null, currentSignature = null, syncRunning = false;
    let hasLive = false;

    function usePhotos(photos) {
      const all = uniquePhotos(photos);
      if (!all.length) return;
      const signature = all.slice().sort().join('\n');
      if (signature === currentSignature) return;
      if (strip) strip.stop();
      if (heroSlide) heroSlide.stop();
      strip = createStrip(track, all, options);
      heroSlide = createHero(hero, all, options);
      currentSignature = signature;
    }

    usePhotos(fallback); // Render immediately, including when Google's live feed is unavailable.
    if (status) status.textContent = settings.feedUrl ? 'Saved memories · connecting' : 'Offline reel';

    async function synchronize() {
      if (!settings.feedUrl || syncRunning) return;
      syncRunning = true;
      try {
        const candidates = await fetchFeed(settings.feedUrl);
        if (!candidates.length) throw new Error('Photo feed returned no photos.');
        const verified = await workingImages(candidates);
        if (!verified.length) throw new Error('The feed photo links cannot load.');
        usePhotos([...fallback, ...verified]);
        hasLive = true;
        if (status) status.textContent = 'Live reel · photos connected';
      } catch (error) {
        console.warn('[Memory reel] Showing saved photos; live photo sync is unavailable:', error);
        if (status && !hasLive) status.textContent = 'Saved memories · live sync unavailable';
      } finally { syncRunning = false; }
    }

    if (settings.feedUrl) {
      synchronize();
      if (settings.refreshEveryMs) window.setInterval(synchronize, settings.refreshEveryMs);
    }
  }

  window.StillOnFireReel = { mount, parseFeed, uniquePhotos };
})();
