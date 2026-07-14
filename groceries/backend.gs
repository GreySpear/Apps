/**
 * Grocery List backend — Google Apps Script, container-bound to a Google Sheet.
 *
 * Matches the sync contract that grocery-list.html speaks:
 *   - GET  ?action=read              -> { items: [...rows], staples: [...rows] }
 *   - POST {sheet:'items',   rows}   -> full-replace the "items" sheet
 *   - POST {sheet:'staples', rows}   -> full-replace the "staples" sheet
 *
 * Row shapes (must match the client's toRows/fromRows):
 *   items:   [id, name, qty, unit, checked('1'/'0')]
 *   staples: [id, name, qty, unit]
 *
 * The Recipes app's "Send to grocery list" feature posts to this same URL
 * with {sheet:'items', rows}, so pointing the Recipes app at this deployment
 * is all that's needed to link the two.
 *
 * Setup: paste this whole file into Extensions -> Apps Script on a Google
 * Sheet, then Deploy -> New deployment -> Web app (Execute as: Me,
 * Access: Anyone). See SETUP.md for full step-by-step instructions.
 */

// ---- Config -------------------------------------------------------------

var SHEETS = {
  items:   ['id', 'name', 'qty', 'unit', 'checked'],
  staples: ['id', 'name', 'qty', 'unit']
};

// ---- Entry points -------------------------------------------------------

function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : null;
    if (action === 'read') {
      return jsonOutput_({
        items:   getDataRows_('items'),
        staples: getDataRows_('staples')
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
    if (data.sheet && SHEETS[data.sheet]) {
      return handleSave_(data.sheet, data.rows || []);
    }
    return jsonOutput_({ ok: false, error: 'Unknown or missing sheet' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

// ---- Save (full replace of one sheet) -----------------------------------

function handleSave_(name, rows) {
  var sheet = getSheet_(name);
  var numCols = SHEETS[name].length;

  // Clear existing data rows (everything below the header), leaving the
  // header row (row 1) untouched.
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }

  if (rows.length > 0) {
    // Normalize every row to exactly numCols so setValues() can't choke on
    // ragged client input.
    var normalized = rows.map(function (r) {
      var row = r.slice(0, numCols);
      while (row.length < numCols) row.push('');
      return row;
    });
    sheet.getRange(2, 1, normalized.length, numCols).setValues(normalized);
  }

  return jsonOutput_({ ok: true });
}

// ---- Sheet helpers ------------------------------------------------------

/** Returns a sheet by name, creating it (with header row) if missing. */
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

/** All data rows for a sheet (excludes the header row). [] if empty. */
function getDataRows_(name) {
  var sheet = getSheet_(name);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = Math.max(sheet.getLastColumn(), SHEETS[name].length);
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
