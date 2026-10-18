/** STILL-ON-FIRE V23 - OPTIONAL GOOGLE APPS SCRIPT REPLACEMENT
 * Read-only slideshow photo feed from the existing shared Google Drive folder.
 * To publish: Deploy > New deployment > Web app > Execute as Me > Anyone.
 * Keep this code in a Google account WITH ACCESS to the folder below.
 * This code DOES NOT change Drive sharing permissions or upload/delete files.
 * CAUTION: Public website means visitors can see returned photo links.
 */
var SOFIRE_FOLDER_ID = '1303l_SMGXM7H-x27RGDhT7H0Z-goqKjf';
var SOFIRE_MAX_IMAGES = 2000;

function doGet(e) {
  var param = e && e.parameter ? e.parameter : {};
  var result;
  try {
    var folder = DriveApp.getFolderById(SOFIRE_FOLDER_ID);
    var photos = [];
    var pending = [folder];
    while (pending.length > 0 && photos.length < SOFIRE_MAX_IMAGES) {
      var dir = pending.shift();
      var items = dir.getFiles();
      while (items.hasNext() && photos.length < SOFIRE_MAX_IMAGES) {
        var f = items.next();
        var type = f.getMimeType();
        if (!/^image\/(jpeg|png|webp|gif)$/i.test(type)) continue;
        var id = f.getId();
        photos.push({
          id: id,
          mimeType: type,
          url: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w3200'
        });
      }
      var dirs = dir.getFolders();
      while (dirs.hasNext()) pending.push(dirs.next());
    }
    result = { ok: true, count: photos.length, images: photos };
  } catch (err) {
    // Owner must authorize the script and have permission to see this folder.
    result = { ok: false, error: 'FOLDER_NOT_ACCESSIBLE_OR_SCRIPT_UNAUTHORIZED' };
  }
  // Optional read-only JSONP fallback for browsers where CORS blocks JSON fetch.
  // Never use JSONP to expose secrets or any write operation.
  var callback = String(param.callback || param.prefix || '');
  if (callback) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,90}$/.test(callback)) {
      return ContentService.createTextOutput('Invalid callback').setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
