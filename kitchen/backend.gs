/**
 * Kitchen app backend — Google Apps Script, container-bound to ONE Google Sheet.
 *
 * Consolidates the old Recipes + Grocery List backends into a single web-app
 * deployment. One Sheet, three tabs (`recipes`, `items`, `staples`), one URL.
 *
 * Sync contract the merged kitchen/index.html speaks:
 *   - GET  ?action=read                     -> { recipes:[...], items:[...], staples:[...] }
 *   - POST {action:'save',  rows:[...]}      -> full-replace the "recipes" sheet
 *   - POST {sheet:'items',  rows:[...]}      -> full-replace the "items" sheet
 *   - POST {sheet:'staples',rows:[...]}      -> full-replace the "staples" sheet
 *   - POST {action:'fetch', url:'https://…'} -> server-side fetch of a recipe
 *         page (avoids CORS), returns JSON-LD blocks + og/twitter meta tags
 *   - POST {action:'ocr',   image:'<base64>', mimeType:'image/jpeg'}
 *                                            -> Drive OCR of a recipe photo
 *
 * Row shapes (must match the client's row mappers):
 *   recipes: id | title | category | sourceUrl | imageUrl | ingredients |
 *            steps | servings | prepTime | cookTime | notes | favorite |
 *            cookedDates | createdAt | updatedAt
 *   items:   id | name | qty | unit | checked('1'/'0')
 *   staples: id | name | qty | unit
 *
 * Setup: paste this whole file into Extensions -> Apps Script on a Google
 * Sheet, then Deploy -> New deployment -> Web app (Execute as: Me,
 * Access: Anyone). See SETUP.md for full step-by-step instructions.
 */

// ---- Config -----------------------------------------------------------

var RECIPES_SHEET = 'recipes';

// Recipes column order — must match the data model exactly.
var RECIPE_HEADERS = [
  'id', 'title', 'category', 'sourceUrl', 'imageUrl',
  'ingredients', 'steps', 'servings', 'prepTime', 'cookTime', 'notes',
  'favorite', 'cookedDates', 'createdAt', 'updatedAt'
];

// Grocery sheets and their headers.
var GROCERY_SHEETS = {
  items:   ['id', 'name', 'qty', 'unit', 'checked'],
  staples: ['id', 'name', 'qty', 'unit']
};

var MAX_RESPONSE_BYTES = 200 * 1024; // cap the /fetch response to ~200KB
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ---- One-time authorization helper ----------------------------------------

/**
 * Run this ONCE from the editor (select "authorizeOnce" in the toolbar
 * dropdown, then click Run) after adding the Drive API service. The web app
 * keeps using the permissions you granted originally and never shows a new
 * prompt on its own — running any function from the editor is what forces
 * Google to show the authorization dialog with the new Drive permission.
 * This function creates and changes nothing.
 */
function authorizeOnce() {
  Logger.log('Sheet OK: ' + SpreadsheetApp.getActiveSpreadsheet().getName());
  if (typeof Drive === 'undefined') {
    Logger.log('Drive service NOT enabled — add "Drive API" under Services (+) in the left sidebar, then run this again.');
  } else {
    Logger.log('Drive service OK — recipe photo import (OCR) is ready.');
  }
}

// ---- Entry points -------------------------------------------------------

function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : null;
    if (action === 'read') {
      return jsonOutput_({
        recipes: getDataRows_(getSheet_(RECIPES_SHEET, RECIPE_HEADERS), RECIPE_HEADERS),
        items:   getDataRows_(getSheet_('items',   GROCERY_SHEETS.items),   GROCERY_SHEETS.items),
        staples: getDataRows_(getSheet_('staples', GROCERY_SHEETS.staples), GROCERY_SHEETS.staples)
      });
    }
    return jsonOutput_({ ok: false, error: 'Unknown or missing action' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Grocery saves are addressed by sheet name.
    if (data.sheet && GROCERY_SHEETS[data.sheet]) {
      return handleGrocerySave_(data.sheet, data.rows || []);
    }
    // Recipe operations are addressed by action.
    if (data.action === 'save')  return handleRecipeSave_(data);
    if (data.action === 'fetch') return handleFetch_(data);
    if (data.action === 'ocr')   return handleOcr_(data);

    return jsonOutput_({ ok: false, error: 'Unknown action or sheet' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

// ---- Save (full replace of one sheet) -----------------------------------

function handleRecipeSave_(data) {
  return fullReplace_(getSheet_(RECIPES_SHEET, RECIPE_HEADERS), RECIPE_HEADERS.length, data.rows || []);
}

function handleGrocerySave_(name, rows) {
  return fullReplace_(getSheet_(name, GROCERY_SHEETS[name]), GROCERY_SHEETS[name].length, rows);
}

/**
 * Replaces every data row (row 2 down) with `rows`, leaving the header (row 1)
 * untouched. Rows are normalized to exactly numCols so setValues() can't choke
 * on ragged client input.
 */
function fullReplace_(sheet, numCols, rows) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  if (rows.length > 0) {
    var normalized = rows.map(function (r) {
      var row = r.slice(0, numCols);
      while (row.length < numCols) row.push('');
      return row;
    });
    sheet.getRange(2, 1, normalized.length, numCols).setValues(normalized);
  }
  return jsonOutput_({ ok: true });
}

// ---- Fetch (server-side page fetch, for recipe URL import) ---------------

function handleFetch_(data) {
  var url = data.url;
  if (!url || typeof url !== 'string' || url.indexOf('http') !== 0) {
    return jsonOutput_({ ok: false, error: 'Invalid URL' });
  }

  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': USER_AGENT }
    });
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'Fetch failed: ' + String(err) });
  }

  var code = response.getResponseCode();
  if (code >= 400) {
    return jsonOutput_({ ok: false, error: 'HTTP ' + code });
  }

  var html = response.getContentText();
  var result = {
    ok: true,
    ldjson: extractLdJson_(html),
    og: extractOg_(html)
  };
  return jsonOutput_(capResponseSize_(result));
}

/**
 * Extracts the raw text content of every <script type="application/ld+json">
 * block. Regex-based (not parsed) so a malformed block from one site can't
 * break extraction of the rest — the client parses each string itself.
 */
function extractLdJson_(html) {
  var re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  var blocks = [];
  var m;
  while ((m = re.exec(html)) !== null) {
    blocks.push(m[1].trim());
    if (blocks.length >= 25) break; // sanity cap, real pages have 1-3
  }
  return blocks;
}

/**
 * Extracts og:/twitter: meta tag content for title/image/description.
 */
function extractOg_(html) {
  var metaRe = /<meta[^>]*>/gi;
  var wanted = {
    'og:title': null, 'twitter:title': null,
    'og:description': null, 'twitter:description': null,
    'og:image': null, 'twitter:image': null
  };
  var m;
  while ((m = metaRe.exec(html)) !== null) {
    var tag = m[0];
    var propMatch = tag.match(/(?:property|name)\s*=\s*["']?([^"'\s>]+)["']?/i);
    var contentMatch = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (propMatch && contentMatch) {
      var key = propMatch[1].toLowerCase();
      if (key in wanted && wanted[key] === null) {
        wanted[key] = contentMatch[1];
      }
    }
  }

  return {
    title: wanted['og:title'] || wanted['twitter:title'] || extractTitleTag_(html) || '',
    image: wanted['og:image'] || wanted['twitter:image'] || '',
    description: wanted['og:description'] || wanted['twitter:description'] || ''
  };
}

function extractTitleTag_(html) {
  var m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].trim() : '';
}

/** Trims the /fetch response down to roughly MAX_RESPONSE_BYTES if needed. */
function capResponseSize_(result) {
  if (JSON.stringify(result).length <= MAX_RESPONSE_BYTES) return result;

  while (result.ldjson.length > 1 && JSON.stringify(result).length > MAX_RESPONSE_BYTES) {
    result.ldjson.pop();
  }

  if (JSON.stringify(result).length > MAX_RESPONSE_BYTES) {
    if (result.og && result.og.description) {
      result.og.description = result.og.description.slice(0, 500);
    }
    result.ldjson = result.ldjson.map(function (s) { return s.slice(0, 100000); });
  }

  if (JSON.stringify(result).length > MAX_RESPONSE_BYTES) {
    result.truncated = true;
  }

  return result;
}

// ---- OCR (photo of a written/printed recipe -> text) ---------------------

/**
 * {action:'ocr', image:'<base64 jpeg/png>', mimeType:'image/jpeg'}
 * Uses Google Drive's built-in OCR: uploads the image converted to a
 * temporary Google Doc (Drive extracts the text), reads the text out,
 * then deletes the temp doc. Requires the "Drive API" advanced service
 * to be enabled in the Apps Script editor — see SETUP.md.
 */
function handleOcr_(data) {
  if (!data.image) {
    return jsonOutput_({ ok: false, error: 'No image data' });
  }
  if (typeof Drive === 'undefined') {
    return jsonOutput_({
      ok: false,
      error: 'OCR not enabled: in the Apps Script editor, add the "Drive API" ' +
             'service (Services +), then deploy a New version. See SETUP.md.'
    });
  }

  var docId = null;
  try {
    var blob = Utilities.newBlob(
      Utilities.base64Decode(data.image),
      data.mimeType || 'image/jpeg',
      'recipe-photo'
    );

    var file;
    if (Drive.Files.create) {
      // Advanced Drive service v3 (the current default)
      file = Drive.Files.create(
        { name: 'recipe-ocr-temp', mimeType: 'application/vnd.google-apps.document' },
        blob,
        { ocrLanguage: 'en' }
      );
    } else {
      // Advanced Drive service v2 (older projects)
      file = Drive.Files.insert(
        { title: 'recipe-ocr-temp' },
        blob,
        { convert: true, ocr: true, ocrLanguage: 'en' }
      );
    }
    docId = file.id;

    var text = DocumentApp.openById(docId).getBody().getText();
    return jsonOutput_({ ok: true, text: text });
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'OCR failed: ' + String(err) });
  } finally {
    if (docId) {
      try { Drive.Files.remove(docId); } catch (ignore) {}
    }
  }
}

// ---- Sheet helpers --------------------------------------------------------

/** Returns a sheet by name, creating it (with its header row) if missing. */
function getSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

/** All data rows for a sheet (excludes the header row). [] if empty. */
function getDataRows_(sheet, headers) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = Math.max(sheet.getLastColumn(), headers.length);
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
