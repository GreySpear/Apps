/**
 * Home Maintenance Log backend — Google Apps Script, container-bound to a
 * Google Sheet. Mirrors the sync pattern used by the sibling Recipes and
 * Grocery List apps:
 *
 *  - GET  ?action=read                  -> read all three sheets
 *  - GET  ?action=photo&id=<fileId>     -> read a photo back as base64
 *  - POST {action:'save', items, tasks, log} -> full-replace all three sheets
 *  - POST {action:'uploadPhoto', image:<base64>, mimeType, name} -> save a
 *        photo (receipt, nameplate, ...) into a Drive folder, returns its id
 *  - POST {action:'deletePhoto', id}    -> move a photo to Drive's trash
 *
 * Photos use the standard DriveApp service — no advanced "Drive API"
 * service needs to be enabled (unlike the recipes OCR feature).
 *
 * Setup: paste this whole file into Extensions -> Apps Script on a Google
 * Sheet, then Deploy -> New deployment -> Web app (Execute as: Me,
 * Access: Anyone). See SETUP.md for full step-by-step instructions.
 */

// ---- Config ---------------------------------------------------------------

// Column order per sheet — must match the data model in PLAN.md exactly.
var SHEETS = {
  items: ['id', 'name', 'category', 'brand', 'model', 'serial', 'location',
          'installDate', 'warrantyExpiry', 'notes', 'photos',
          'createdAt', 'updatedAt'],
  tasks: ['id', 'name', 'itemId', 'category', 'intervalValue', 'intervalUnit',
          'lastDone', 'notes', 'createdAt', 'updatedAt'],
  log:   ['id', 'date', 'title', 'itemId', 'taskId', 'category', 'cost',
          'doneBy', 'notes', 'photos', 'createdAt', 'updatedAt']
};

var PHOTO_FOLDER_NAME = 'Home Maintenance Photos';
var MAX_PHOTO_BYTES = 4 * 1024 * 1024; // reject uploads decoded above ~4MB

// ---- One-time authorization helper ----------------------------------------

/**
 * Optional: run once from the editor (select "authorizeOnce" in the toolbar
 * dropdown, click Run) to trigger the authorization prompt before deploying.
 * Creates and changes nothing.
 */
function authorizeOnce() {
  Logger.log('Sheet OK: ' + SpreadsheetApp.getActiveSpreadsheet().getName());
  Logger.log('Drive OK: ' + DriveApp.getRootFolder().getName());
}

// ---- Entry points ----------------------------------------------------------

function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : null;
    if (action === 'read') {
      return jsonOutput_({
        ok: true,
        items: getDataRows_(getSheet_('items')),
        tasks: getDataRows_(getSheet_('tasks')),
        log: getDataRows_(getSheet_('log'))
      });
    }
    if (action === 'photo') {
      return handlePhotoRead_(e.parameter.id);
    }
    return jsonOutput_({ ok: false, error: 'Unknown or missing action' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === 'save') {
      return handleSave_(data);
    }
    if (data.action === 'uploadPhoto') {
      return handlePhotoUpload_(data);
    }
    if (data.action === 'deletePhoto') {
      return handlePhotoDelete_(data);
    }
    return jsonOutput_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

// ---- Save (full replace, all three sheets) ---------------------------------

function handleSave_(data) {
  Object.keys(SHEETS).forEach(function (name) {
    // Only replace sheets the client actually sent, so a partial payload
    // can never wipe a sheet it didn't mean to touch.
    if (!Array.isArray(data[name])) return;
    writeRows_(getSheet_(name), data[name], SHEETS[name].length);
  });
  return jsonOutput_({ ok: true });
}

function writeRows_(sheet, rows, numCols) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  if (rows.length > 0) {
    // Normalize every row to exactly numCols columns so setValues() never
    // chokes on ragged input from the client.
    var normalized = rows.map(function (r) {
      var row = r.slice(0, numCols);
      while (row.length < numCols) row.push('');
      return row;
    });
    sheet.getRange(2, 1, normalized.length, numCols).setValues(normalized);
  }
}

// ---- Photos ----------------------------------------------------------------

/** {action:'uploadPhoto', image:'<base64>', mimeType:'image/jpeg', name} */
function handlePhotoUpload_(data) {
  if (!data.image) {
    return jsonOutput_({ ok: false, error: 'No image data' });
  }
  var bytes = Utilities.base64Decode(data.image);
  if (bytes.length > MAX_PHOTO_BYTES) {
    return jsonOutput_({ ok: false, error: 'Image too large (max 4MB)' });
  }
  var blob = Utilities.newBlob(bytes, data.mimeType || 'image/jpeg',
    data.name || ('photo-' + new Date().toISOString()));
  var file = getPhotoFolder_().createFile(blob);
  return jsonOutput_({ ok: true, id: file.getId() });
}

/** GET ?action=photo&id=... -> {ok, data:<base64>, mimeType} */
function handlePhotoRead_(id) {
  if (!id) {
    return jsonOutput_({ ok: false, error: 'Missing photo id' });
  }
  var blob = DriveApp.getFileById(id).getBlob();
  return jsonOutput_({
    ok: true,
    data: Utilities.base64Encode(blob.getBytes()),
    mimeType: blob.getContentType()
  });
}

/** {action:'deletePhoto', id} — trashes the file (recoverable in Drive). */
function handlePhotoDelete_(data) {
  if (!data.id) {
    return jsonOutput_({ ok: false, error: 'Missing photo id' });
  }
  DriveApp.getFileById(data.id).setTrashed(true);
  return jsonOutput_({ ok: true });
}

/** Returns the photos folder, creating it on first use. */
function getPhotoFolder_() {
  var folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  return folders.hasNext() ? folders.next()
                           : DriveApp.createFolder(PHOTO_FOLDER_NAME);
}

// ---- Sheet helpers ----------------------------------------------------------

/** Returns the named sheet, creating it (with header row) if missing. */
function getSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]);
  }
  return sheet;
}

/** All data rows (excludes the header row). Returns [] if sheet is empty. */
function getDataRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
