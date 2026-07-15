/**
 * Recipes app backend — Google Apps Script, container-bound to a Google Sheet.
 *
 * Mirrors the sync pattern used by the sibling "Grocery List" app:
 *  - GET  ?action=read                     -> read all recipes
 *  - POST {action:'save', rows:[...]}      -> full-replace the recipes sheet
 *  - POST {action:'fetch', url:'https://…'} -> server-side fetch of a recipe
 *        page (avoids CORS), returns JSON-LD blocks + og/twitter meta tags
 *
 * Setup: paste this whole file into Extensions -> Apps Script on a Google
 * Sheet, then Deploy -> New deployment -> Web app (Execute as: Me,
 * Access: Anyone). See SETUP.md for full step-by-step instructions.
 */

// ---- Config -----------------------------------------------------------

var SHEET_NAME = 'recipes';

// Column order — must match the data model in PLAN.md exactly.
var HEADERS = [
  'id', 'title', 'category', 'sourceUrl', 'imageUrl',
  'ingredients', 'steps', 'servings', 'prepTime', 'cookTime', 'notes',
  'favorite', 'cookedDates', 'createdAt', 'updatedAt'
];

var MAX_RESPONSE_BYTES = 200 * 1024; // cap the /fetch response to ~200KB
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ---- Entry points -------------------------------------------------------

function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : null;
    if (action === 'read') {
      var sheet = getRecipesSheet_();
      return jsonOutput_({ recipes: getDataRows_(sheet) });
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
    if (data.action === 'fetch') {
      return handleFetch_(data);
    }
    if (data.action === 'ocr') {
      return handleOcr_(data);
    }
    return jsonOutput_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

// ---- Save (full replace) -------------------------------------------------

function handleSave_(data) {
  var sheet = getRecipesSheet_();
  var rows = data.rows || [];
  var numCols = HEADERS.length;

  // Clear existing data rows (everything below the header), leaving the
  // header itself (row 1) untouched.
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

  return jsonOutput_({ ok: true });
}

// ---- Fetch (server-side page fetch, for recipe import) ------------------

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
 * Attribute order doesn't matter (id/type/data-* can appear in any order)
 * and the block content may span multiple lines.
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
 * Scans whole <meta ...> tags first, then pulls property/name and content
 * out of each independently, so it doesn't matter which attribute comes
 * first within the tag.
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

  // First, drop trailing ld+json blocks (least likely to be the main
  // Recipe object, which is usually first). Always keep the first block —
  // if it alone is too big it gets truncated below, not dropped.
  while (result.ldjson.length > 1 && JSON.stringify(result).length > MAX_RESPONSE_BYTES) {
    result.ldjson.pop();
  }

  // Still too big (huge single block or description) — truncate what's left.
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
    // Always clean up the temporary Google Doc.
    if (docId) {
      try { Drive.Files.remove(docId); } catch (ignore) {}
    }
  }
}

// ---- Sheet helpers --------------------------------------------------------

/** Returns the "recipes" sheet, creating it (with header row) if missing. */
function getRecipesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sheet;
}

/** All data rows (excludes the header row). Returns [] if sheet is empty. */
function getDataRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = Math.max(sheet.getLastColumn(), HEADERS.length);
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
