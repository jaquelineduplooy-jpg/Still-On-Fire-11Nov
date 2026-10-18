/**
 * STILL-ON-FIRE V25 - READ-ONLY PREBUILT GOOGLE DRIVE PHOTO INDEX
 * Prefer a NEW standalone Apps Script for Still-On-Fire so Tankwa stays unchanged.
 * This design avoids enumerating hundreds of Drive files in every HTTP request.
 *
 * IMPORTANT: Execute installGalleryRefresh() ONCE as the account that can read
 * the memory folder, then execute refreshGallerySnapshot() ONCE to populate it.
 * Deploy it as a web app; set the new /exec URL in Vercel SOFIRE_GOOGLE_PHOTO_FEED_URL.
 * Deploy as: Execute as Me; Who has access: Anyone (anonymous).
 *
 * No photo sharing permissions are changed; no Drive files are modified.
 */
var SOFIRE_FOLDER_ID = '1303l_SMGXM7H-x27RGDhT7H0Z-goqKjf';
var SOFIRE_MAX_IMAGES = 2500;
var SOFIRE_META = 'SOFIRE_V25_GALLERY_META';
var SOFIRE_CHUNK_SIZE = 90; // Well under 9 KB per ScriptProperty value.

function installGalleryRefresh() {
  // One 5-minute update trigger; avoid duplicate triggers across re-runs.
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'refreshGallerySnapshot')
      ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('refreshGallerySnapshot').timeBased().everyMinutes(5).create();
  Logger.log('Installed 5-minute read-only gallery refresh. Run refreshGallerySnapshot() now.');
}

function refreshGallerySnapshot() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  var store = PropertiesService.getScriptProperties();
  try {
    var folders = [DriveApp.getFolderById(SOFIRE_FOLDER_ID)];
    var records = [];
    var seen = {};
    var started = Date.now();
    while (folders.length && records.length < SOFIRE_MAX_IMAGES) {
      var folder = folders.shift();
      var items = folder.getFiles();
      while (items.hasNext() && records.length < SOFIRE_MAX_IMAGES) {
        var f = items.next();
        var mime = f.getMimeType();
        if (!/^image\/(jpeg|png|webp|gif)$/i.test(mime)) continue;
        var id = f.getId();
        if (seen[id]) continue;
        seen[id] = true;
        // Only store IDs and MIME types. URLs can always be constructed later.
        records.push([id, mime]);
      }
      var children = folder.getFolders();
      while (children.hasNext()) folders.push(children.next());
      // Preserve previous snapshot if scanning has become unusually slow.
      if (Date.now() - started > 270000) throw new Error('SCAN_EXCEEDED_SAFE_TIME');
    }
    if (!records.length) throw new Error('NO_IMAGES_FOUND');
    var oldMeta = store.getProperty(SOFIRE_META);
    var old = oldMeta ? JSON.parse(oldMeta) : null;
    var revision = 'r' + Date.now();
    var chunks = Math.ceil(records.length / SOFIRE_CHUNK_SIZE);
    // Store every chunk BEFORE the pointer changes, so visitors never see half a list.
    for (var c = 0; c < chunks; c++) {
      var part = JSON.stringify(records.slice(c * SOFIRE_CHUNK_SIZE, (c+1) * SOFIRE_CHUNK_SIZE));
      if (part.length > 8500) throw new Error('PROPERTY_CHUNK_TOO_LARGE');
      store.setProperty('SOFIRE_' + revision + '_' + c, part);
    }
    store.setProperty(SOFIRE_META, JSON.stringify({revision:revision,chunks:chunks,count:records.length,updatedAt:new Date().toISOString()}));
    store.deleteProperty('SOFIRE_V25_LAST_ERROR');
    // Only remove old chunks after the new pointer exists.
    if (old && old.revision && old.revision !== revision) {
      for (var k = 0; k < old.chunks; k++) store.deleteProperty('SOFIRE_' + old.revision + '_' + k);
    }
    // Clean orphaned chunks from a refresh that may have stopped mid-write.
    var activePrefix = 'SOFIRE_' + revision + '_';
    var allKeys = store.getProperties();
    for (var key in allKeys) {
      if (/^SOFIRE_r\d+_\d+$/.test(key) && key.indexOf(activePrefix) !== 0)
        store.deleteProperty(key);
    }
    Logger.log('Gallery snapshot updated: ' + records.length + ' distinct photographs');
  } catch (error) {
    // Existing good index remains available even when a refresh fails.
    store.setProperty('SOFIRE_V25_LAST_ERROR', String(error && error.message || error).slice(0,120));
    Logger.log('Gallery refresh failed: ' + error);
    throw error;
  } finally {lock.releaseLock();}
}

function doGet(e) {
  var param = e && e.parameter ? e.parameter : {};
  var output;
  try {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty(SOFIRE_META);
    if (!raw) {
      output = {ok:false,error:'SNAPSHOT_NOT_READY',hint:'Run installGalleryRefresh and refreshGallerySnapshot in Apps Script.'};
    } else {
      var meta = JSON.parse(raw);
      var current = props.getProperties();
      var records = [];
      for (var j = 0; j < meta.chunks; j++) {
        var block = current['SOFIRE_' + meta.revision + '_' + j];
        if (!block) throw new Error('SNAPSHOT_CHUNK_MISSING');
        var entries = JSON.parse(block);
        for (var k = 0; k < entries.length; k++) records.push(entries[k]);
      }
      if (records.length !== meta.count) throw new Error('SNAPSHOT_COUNT_MISMATCH');
      if (String(param.health || '') === '1') {
        output = {ok:true,version:'V25',count:meta.count,updatedAt:meta.updatedAt};
      } else {
        var images = records.map(function (entry) {
          var id = String(entry[0]);
          var key = encodeURIComponent(id);
          return {
            id:id, mimeType:entry[1],
            // Viewable public image preview at high requested size.
            url:'https://drive.google.com/thumbnail?id=' + key + '&sz=w4096',
            // Try an original file before the high-resolution preview.
            originalUrl:'https://drive.google.com/uc?export=download&id=' + key,
            fullSizeUrl:'https://lh3.googleusercontent.com/d/' + key + '=w4096'
          };
        });
        output = {ok:true,version:'V25',count:images.length,updatedAt:meta.updatedAt,images:images};
      }
    }
  } catch (err) {
    output = {ok:false,error:String(err && err.message || err).slice(0,100)};
  }
  var json = JSON.stringify(output);
  var callback = String(param.callback || '');
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]{0,90}$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
