STILL ON FIRE — V22 | LIVE GOOGLE DRIVE + HD-TV MEMORY REEL
=========================================================

THIS ZIP is based on the latest Still-On-Fire V21 Kosé website, NOT an older
Tankwa website. Its Kosé layout, menu, photographs and music links are retained.

THE FIX
- Uses the same Google Apps Script endpoint and direct-image URL strategy as
  the working Tankwa live Memory Reel, without the failing /api/photos relay.
- Displays all distinct photo URLs from the live feed, not just the first 16.
- Random start plus Fisher-Yates shuffle through the full collection; a photo
  cannot recur in the hero display until every other displayable photo has
  appeared, except if a photo URL is broken or there is only one photo.
- Continuously moving filmstrip with a new random order instead of two fixed
  identical image sequences. It does not pause if the TV mouse is over it.
- Uses the exact source URL returned from the Google feed, upgrading Google's
  size parameter without converting URLs into unrelated thumbnail endpoints.
- Ships the 7 higher-resolution 2560x1440 local fallback photos taken from
  your uploaded Tankwa offline reel pack (rather than 1600x900 backups).
- The live gallery indicator shows how many distinct photos are connected.

DEPLOY
1. Extract this ZIP and deploy its CONTENTS as the Vercel project root.
2. Visit https://still-on-fire.vercel.app/memory-reel-live/index.html
3. Read the status badge on the lower right:
   - "Google Drive live · N distinct photos · shuffled": connected successfully.
   - "Drive unavailable · showing 7 saved HD photos": no usable live feed.
4. Hard refresh (Ctrl/Cmd+Shift+R) if your TV browser caches an old page.

The older /api/photos endpoint is no longer used by V22. A 404 at that old
address is not a problem. V22 fetches the exact Google Apps Script URL that
Tankwa uses directly in the visitor's browser.

LIMITATIONS
- Google Drive must allow the Apps Script / image URLs to be viewed by the
  TV browser. This cannot be verified without access to your deployed Drive.
- The 2560x1440 offline images cannot recreate detail absent from originals.
- If the feed is unavailable, a 7-picture backup will necessarily repeat
  after a shuffled cycle. It is never represented as the complete Drive feed.

PHOTO UPLOAD LINK AND QR CODE: left unchanged from your existing website.
