STILL ON FIRE — V21 HD-TV MEMORY REEL
===================================

This is the FULL V20 Kose website with ONLY the memory-reel playback / photo-feed changes.
All other V20 page content, menus, photographs, invitation details and styling are retained.

UPDATED FILES
- assets/memory-reel.js (high-resolution image requests, no-repeat shuffle, live-only gallery)
- memory-reel-live/index.html (TV-resolution framing; no fixed first picture; non-pausing playback)
- memory-reel-offline/index.html (sharp, uncropped saved photographs and continual shuffle)
- index.html (photo feed routed through the same-domain endpoint)
- api/photos.js (NEW Vercel function to relay the existing Google Apps Script JSON feed)

HOW TO PUBLISH
1. Extract this ZIP at the root of the existing website's GitHub/Vercel project.
2. Upload/commit ALL files, including the new api/photos.js and assets/memory-reel.js.
3. Redeploy on Vercel and wait for deployment completion.
4. Check https://still-on-fire.vercel.app/api/photos
   It should return JSON with the shared photos. If it shows an error, the
   Google Apps Script feed or its access permissions need attention.
5. Open https://still-on-fire.vercel.app/memory-reel-live/index.html
   Hard refresh (Ctrl+Shift+R on Windows, Cmd+Shift+R on Mac) to bypass the old code.

ON THE HD TV
- Open the live reel full-screen in Chrome or the TV's best available browser.
- Use the TV's native 1920x1080 or 3840x2160 output. Avoid low-resolution
  wireless mirroring when sharper direct HDMI playback is available.
- The badge at the bottom right tells you what is actually happening:
  'Live · N distinct photos' = N unique photos from the Google Drive feed.
  'Saved only · 7 photos · Drive unavailable' = live sync failed, and the seven
  saved photographs are all that can be displayed until the connection is fixed.
- The first photo is shuffled, and each source image is shown before the deck
  reshuffles. Repetition is unavoidable if only seven photos are available.
- When connected, the online gallery is used instead of adding the local saved
  pictures a second time, reducing duplicate-looking sequences.

IMAGE QUALITY
- The main display now requests Google Drive images up to 4096 px wide on 4K,
  with lower-resolution fallback routes if the requested size is unavailable.
- Filmstrip thumbnails are fetched separately at sizes suited to their smaller frames.
- Foreground pictures are never blurred by CSS, cropped, zoomed or stretched.
- Actual sharpness still depends on the original image: the seven pictures
  bundled in V20 are each 1600x900 px and some were already soft scans.
  Their lost detail cannot be restored by changing code; upload original
  high-resolution photos to the shared Google Drive folder for best TV quality.
- For a truly sharp 1080p or 4K view, original photo files should ideally be
  at least 1920 or 3840 pixels wide respectively (where available).

NOTE
The live Apps Script backend and Google Drive folder cannot be tested for
access in this offline test environment. The gallery, shuffle, layout, HD
image-size requests and TV behaviour were tested with a simulated live feed
and in-browser rendering at 1920x1080 and 3840x2160.
