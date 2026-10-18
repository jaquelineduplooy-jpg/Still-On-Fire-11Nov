STILL-ON-FIRE V23 | MEMORY REEL CONNECTION REPAIR + DIAGNOSTICS
================================================================

THIS IS THE LATEST STILL-ON-FIRE KOSE WEBSITE (not Tankwa).
All prior Kosé sections, images, Spotify playlist, location, sharing link,
and blue styling are preserved. Changes concern the Memory Reel only.

WHAT CHANGED
- V22's sequential photo checks could stall for minutes: now parallel and bounded.
- /api/photos uses a server-side Google Apps Script relay (avoids browser CORS).
- If the relay fails, the reel also tries the original direct Google URL and
  an optional read-only JSONP fallback (when supported by Apps Script).
- It checks only three sample photos, concurrently, before activating live mode.
- It shows an actionable error code instead of showing Connecting... indefinitely.
- No photo repeats in the main shuffled deck until all working photos have played.
- Main photos are contained and use the highest resolution that actually loads.
- Keeps seven 2560 x 1440 offline emergency backup photos.
- A dedicated diagnostics page tests the actual feed and one photo:
    https://still-on-fire.vercel.app/memory-reel-live/diagnostics.html

DEPLOYMENT
1. Extract the ZIP; upload its CONTENTS to the same Vercel project root.
2. It MUST include the api/photos.js serverless function and the assets folder.
3. Redeploy. Hard-refresh the TV browser; do not test a cached older version.
4. Open /api/photos?health=1 on the deployed URL.
   Healthy: {"ok":true,"version":"V23","source":"Google Apps Script","photoCount":...}
   Failed:  {"ok":false,"version":"V23","code":"...","hint":"..."}
5. If unhealthy, open /memory-reel-live/diagnostics.html and share the CODE.

IF GOOGLE APPS SCRIPT IS BROKEN OR MOVED
This ZIP includes scripts/Code.gs as a READ-ONLY replacement photo-feed script.
This part requires the Google Drive folder owner's authorization:
A. Visit script.google.com under the Google account with access to the photo folder.
B. Create a new script project, replace Code.gs with scripts/Code.gs, and save.
C. Run doGet once to authorize access to the shared Drive folder.
D. Deploy > New deployment > Web app.
   Execute as: Me (script owner). Who has access: Anyone (not just signed-in).
E. Copy the deployed URL ending /exec.
F. Vercel Project Settings > Environment Variables:
   add SOFIRE_GOOGLE_PHOTO_FEED_URL = your new /exec URL.
   Redeploy to apply it. The /api/photos route uses the new URL automatically.
G. Visit /api/photos?health=1 again. If it says FEED_OK or ok=true with a
   positive photoCount, you have fixed the PHOTO LIST CONNECTION.
H. Run /memory-reel-live/diagnostics.html. Its IMAGE test must also succeed.

ACCESS / PRIVACY
- This is a public gallery. Only use photographs intended to be displayed to
  site visitors. The bundled script does NOT grant sharing to any Drive file.
- Photos still require a browser-accessible image link: public viewing of
  the corresponding image is necessary for anonymous TV browsers.
- The Code.gs implementation uses Google Drive thumbnail links requested at
  3200 pixels. Actual quality is limited by the original uploaded photographs.
- The public script lists images and subfolders but NEVER uploads, edits,
  moves, or deletes files. Review sharing before deploying it publicly.
- If photos cannot be made publicly viewable, upload a ZIP of the ORIGINAL
  full-resolution Drive photo folder so they can be bundled directly instead.

THE MOST IMPORTANT DISTINCTION
- A good-looking Tankwa reel is NOT proof the Google Apps Script feed works.
  Tankwa and Still-On-Fire use the same script and the same seven backup files.
- No website change can revive a revoked Google Drive permission by itself.
  The deployment/folder owner must correct the access or supply the photos.
- Local and mocked-remote browser tests are NOT proof the real shared folder
  can be fetched from the published website.
