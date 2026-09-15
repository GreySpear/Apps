/* Waypoint — offline-first trip app.
 * Vanilla JS. Views + hash routing + IndexedDB + import/export/share + PWA.
 *
 * Data split (see SPEC §4):
 *   - trips  : the shared plan (from trip.json), keyed by trip.id. Re-import
 *              upserts the plan only; personal data below is never touched.
 *   - docs   : user-added image/PDF blobs, tagged to a trip (+ optional reservation).
 *   - state  : per-trip personal state — reservation edits (confirmation/notes),
 *              checklist ticks, custom checklist items — keyed by trip.id.
 * localStorage holds only tiny UI state (last trip, active tab), each read
 * wrapped in try/catch.
 */
'use strict';

/* ------------------------------------------------------------------ utils */
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const tabbar = $('#tabbar');

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return e;
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function hash32(str) { // djb2 → base36, for stable-ish local keys when no id given
  let hsh = 5381;
  for (let i = 0; i < str.length; i++) hsh = ((hsh << 5) + hsh + str.charCodeAt(i)) | 0;
  return (hsh >>> 0).toString(36);
}

function lsGet(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : v; } catch { return fallback; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode / full */ } }

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* object URLs created for the current view, revoked on navigation */
let liveURLs = [];
function objURL(blob) { const u = URL.createObjectURL(blob); liveURLs.push(u); return u; }
function revokeURLs() { liveURLs.forEach(URL.revokeObjectURL); liveURLs = []; }

/* ------------------------------------------------------------------ IndexedDB */
const DB_NAME = 'waypoint', DB_VER = 1;
let _db;
function db() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('trips')) d.createObjectStore('trips', { keyPath: 'trip.id' });
      if (!d.objectStoreNames.contains('state')) d.createObjectStore('state', { keyPath: 'tripId' });
      if (!d.objectStoreNames.contains('docs')) {
        const s = d.createObjectStore('docs', { keyPath: 'docId', autoIncrement: true });
        s.createIndex('tripId', 'tripId', { unique: false });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}
function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((r) => { out = r; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// trips
const putTrip = (plan) => tx('trips', 'readwrite', (s) => s.put(plan));
const getTrip = (id) => tx('trips', 'readonly', (s) => req2p(s.get(id)));
const allTrips = () => tx('trips', 'readonly', (s) => req2p(s.getAll()));
async function deleteTripCascade(id) {
  await tx('trips', 'readwrite', (s) => s.delete(id));
  await tx('state', 'readwrite', (s) => s.delete(id));
  const docs = await docsForTrip(id);
  await tx('docs', 'readwrite', (s) => { docs.forEach((d) => s.delete(d.docId)); });
}
// state
const getState = (id) => tx('state', 'readonly', (s) => req2p(s.get(id)))
  .then((v) => v || { tripId: id, resEdits: {}, checkTicks: {}, checkCustom: {}, checkRemoved: {} });
const putState = (st) => tx('state', 'readwrite', (s) => s.put(st));
// docs
const addDoc = (doc) => tx('docs', 'readwrite', (s) => req2p(s.add(doc)));
const docsForTrip = (id) => tx('docs', 'readonly', (s) => req2p(s.index('tripId').getAll(id)));
const deleteDoc = (docId) => tx('docs', 'readwrite', (s) => s.delete(docId));

/* ------------------------------------------------------------------ schema / normalize */
const SEG_SEED = { LA: ['--coral', '--coral-ink'], DRIVE: ['--gold', '--gold-ink'], SF: ['--teal', '--teal-ink'] };
const SEG_CYCLE = [['--redwood', '--redwood'], ['--teal', '--teal-ink'], ['--coral', '--coral-ink'], ['--gold', '--gold-ink']];

function segColors(days) {
  const map = {}; let n = 0;
  for (const d of days || []) {
    const seg = (d.segment || '').trim() || '—';
    if (map[seg]) continue;
    if (SEG_SEED[seg]) map[seg] = SEG_SEED[seg];
    else map[seg] = SEG_CYCLE[n++ % SEG_CYCLE.length];
  }
  return map;
}

// stable local key for a reservation: explicit id wins, else hash of type|name
const resKey = (r, i) => r && r.id ? 'id:' + r.id : 'h:' + hash32((r.type || '') + '|' + (r.name || '') + '|' + i);
// checklist item key: id wins, else hash of listName|text (stable across reorder)
const checkKey = (listName, item) => (item && typeof item === 'object' && item.id)
  ? 'id:' + item.id : 'h:' + hash32(listName + '|' + (typeof item === 'object' ? item.text : item));

function validatePlan(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Not a valid file.');
  if (obj.schemaVersion != null && Number(obj.schemaVersion) > 1)
    throw new Error('This trip needs a newer version of Waypoint.');
  if (!obj.trip || !obj.trip.id || !obj.trip.title)
    throw new Error('File is missing a trip id or title.');
  // keep only known top-level keys (ignore unknowns gracefully)
  return {
    schemaVersion: 1,
    trip: obj.trip,
    days: Array.isArray(obj.days) ? obj.days : [],
    reservations: Array.isArray(obj.reservations) ? obj.reservations : [],
    checklists: Array.isArray(obj.checklists) ? obj.checklists : [],
  };
}

/* ------------------------------------------------------------------ router */
function parseHash() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean); // ['trip','<id>','reservations']
  if (parts[0] === 'trip' && parts[1]) {
    return { view: 'trip', id: decodeURIComponent(parts[1]), tab: parts[2] || 'itinerary' };
  }
  return { view: 'home' };
}
function go(hash) { location.hash = hash; }

window.addEventListener('hashchange', render);

/* ------------------------------------------------------------------ render root */
async function render() {
  revokeURLs();
  const route = parseHash();
  try {
    if (route.view === 'trip') await renderTrip(route.id, route.tab);
    else await renderHome();
  } catch (e) {
    console.error(e);
    app.innerHTML = '';
    app.append(h('div', { class: 'section-empty' }, 'Something went wrong: ' + e.message));
  }
}

/* ------------------------------------------------------------------ HOME */
function isIOS() { return /iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document); }
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }

async function renderHome() {
  tabbar.hidden = true;
  app.className = '';
  document.title = 'Waypoint';
  const trips = (await allTrips()).sort((a, b) =>
    (a.trip.startDate || '').localeCompare(b.trip.startDate || '') || (a.trip.title || '').localeCompare(b.trip.title || ''));

  $('#topbar-right').replaceChildren(
    h('button', { class: 'btn', onclick: pickImport }, '＋ Import trip')
  );

  app.replaceChildren();
  const head = h('div', { class: 'home-head' },
    h('div', {},
      h('div', { class: 'eyebrow' }, 'Your trips'),
      h('h1', { class: 'page' }, trips.length ? 'Trips' : 'Waypoint')));
  app.append(head);

  if (!trips.length) {
    app.append(h('div', { class: 'empty' },
      h('div', { class: 'pin-lg' }),
      h('div', { class: 'big' }, 'No trips yet'),
      h('p', {}, 'Import a trip.json to see the whole thing — days, reservations, checklists — and carry it offline. Claude generates these files for you.'),
      h('button', { class: 'btn', onclick: pickImport }, '＋ Import a trip'),
      installHint()));
    return;
  }

  const grid = h('div', { class: 'trip-grid' });
  for (const plan of trips) grid.append(tripCard(plan));
  app.append(grid);
  const hint = installHint();
  if (hint) app.append(hint);
}

function installHint() {
  if (isStandalone()) return null;
  if (isIOS()) return h('div', { class: 'ios-hint' }, h('span', {}, '📲'),
    h('span', { html: '<b>Install on iPhone:</b> tap the Share button in Safari, then <b>Add to Home Screen</b>. It then works offline.' }));
  return h('div', { class: 'ios-hint' }, h('span', {}, '📲'),
    h('span', { html: '<b>Tip:</b> install Waypoint from your browser menu (Add to Home screen) so it opens offline like an app.' }));
}

function tripCard(plan) {
  const t = plan.trip;
  const segs = segColors(plan.days);
  const strip = h('div', { class: 'seg-strip' });
  const order = Object.keys(segs);
  (order.length ? order : ['LA']).forEach((s) =>
    strip.append(h('i', { style: `background:var(${segs[s] ? segs[s][0] : '--teal'})` })));
  const meta = h('div', { class: 'tc-meta' });
  if (t.dateLabel || t.startDate) meta.append(h('span', { class: 'chip' }, t.dateLabel || t.startDate));
  if (t.party) meta.append(h('span', { class: 'chip' }, t.party));
  const nights = (t.homeBases || []).reduce((a, b) => a + (Number(b.nights) || 0), 0);
  if (nights) meta.append(h('span', { class: 'chip' }, nights + ' nights'));

  const card = h('div', { class: 'trip-card' });
  card.append(strip);
  const body = h('button', { class: 'tc-body', style: 'width:100%;border:none;background:none;text-align:left', onclick: () => go('#/trip/' + encodeURIComponent(t.id)) },
    h('h3', {}, t.title),
    t.subtitle ? h('div', { class: 'tc-sub' }, t.subtitle) : null,
    meta);
  card.append(body);
  card.append(h('div', { class: 'tc-actions' },
    h('button', { class: 'btn small', onclick: () => go('#/trip/' + encodeURIComponent(t.id)) }, 'Open'),
    h('button', { class: 'btn small ghost', onclick: () => shareTrip(t.id) }, 'Share'),
    h('button', { class: 'btn small ghost', onclick: () => confirmDeleteTrip(plan) }, 'Delete')));
  return card;
}

async function confirmDeleteTrip(plan) {
  if (!confirm(`Delete "${plan.trip.title}"?\n\nThis removes the plan and any photos/notes you added on this device. It can't be undone.`)) return;
  await deleteTripCascade(plan.trip.id);
  toast('Trip deleted');
  render();
}

/* ------------------------------------------------------------------ IMPORT */
function pickImport() { $('#import-input').click(); }
$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const plan = validatePlan(JSON.parse(text));
    const existing = await getTrip(plan.trip.id);
    await putTrip(plan); // plan-only upsert; personal state/docs untouched → merge
    toast(existing ? 'Trip updated — your notes kept' : 'Trip imported');
    go('#/trip/' + encodeURIComponent(plan.trip.id));
  } catch (err) {
    console.error(err);
    toast('Import failed: ' + err.message);
  }
});

/* ------------------------------------------------------------------ TRIP shell */
const TABS = [
  { id: 'itinerary', icon: '🗺️', label: 'Itinerary' },
  { id: 'reservations', icon: '🎫', label: 'Reservations' },
  { id: 'checklists', icon: '✅', label: 'Checklists' },
  { id: 'docs', icon: '📎', label: 'Docs' },
];

async function renderTrip(id, tab) {
  const plan = await getTrip(id);
  if (!plan) { go('#/'); return; }
  lsSet('wp_last', id); lsSet('wp_tab', tab);
  document.title = plan.trip.title + ' · Waypoint';
  const state = await getState(id);

  $('#topbar-right').replaceChildren(
    h('button', { class: 'btn ghost small', onclick: () => go('#/') }, '‹ Trips'),
    h('button', { class: 'btn small', onclick: () => shareTrip(id) }, 'Share'));

  const wide = window.matchMedia('(min-width:800px)').matches;
  buildTabbar(id, tab, plan, state);
  app.className = wide ? 'has-rail' : '';
  app.replaceChildren();

  const body = h('div', {});
  if (tab === 'reservations') await viewReservations(body, plan, state);
  else if (tab === 'checklists') await viewChecklists(body, plan, state);
  else if (tab === 'docs') await viewDocs(body, plan);
  else viewItinerary(body, plan);

  // Wide: tabbar is a side rail = first grid child of #app. Narrow: fixed bottom bar on <body>.
  if (wide) app.append(tabbar, body);
  else { document.body.append(tabbar); app.append(body); }
}

function buildTabbar(id, active, plan, state) {
  tabbar.hidden = false;
  tabbar.replaceChildren();
  for (const t of TABS) {
    let badge = null;
    if (t.id === 'checklists') {
      const total = countChecklistItems(plan, state);
      if (total.remaining > 0) badge = h('span', { class: 'badge' }, String(total.remaining));
    }
    const btn = h('button', {
      class: active === t.id ? 'active' : '',
      onclick: () => go('#/trip/' + encodeURIComponent(id) + '/' + t.id),
      'aria-current': active === t.id ? 'page' : null,
    }, h('span', { class: 'ti' }, t.icon), h('span', {}, t.label), badge);
    tabbar.append(btn);
  }
}

/* ------------------------------------------------------------------ ITINERARY */
function tripHeader(plan) {
  const t = plan.trip;
  const bases = h('div', { class: 'bases' });
  (t.homeBases || []).forEach((b) => bases.append(
    h('span', { class: 'base' }, h('b', {}, b.city || ''), (b.area ? '· ' + b.area : ''), (b.nights ? h('span', { class: 'soft' }, ' · ' + b.nights + 'n') : null))));
  return h('div', { class: 'trip-header' },
    h('div', { class: 'eyebrow' }, [t.dateLabel || '', t.party ? '· ' + t.party : ''].join(' ').trim() || 'Trip'),
    h('h1', { class: 'page' }, t.title),
    t.subtitle ? h('div', { class: 'muted', style: 'font-size:16px;margin-top:2px' }, t.subtitle) : null,
    (t.homeBases || []).length ? bases : null,
    t.notes ? h('div', { class: 'notes' }, t.notes) : null);
}

function dayCard(day, segs, { compact = false } = {}) {
  const seg = (day.segment || '').trim() || '—';
  const col = segs[seg] || ['--teal', '--teal-ink'];
  const card = h('div', {
    class: 'day-card',
    style: `--seg:var(${col[0]});--seg-ink:var(${col[1]})`,
    dataset: { n: String(day.n) },
  });
  card.append(h('div', { class: 'day-top' },
    h('div', { class: 'day-num' }, String(day.n ?? '·')),
    h('div', { class: 'day-head-txt' },
      day.label ? h('div', { class: 'day-label' }, day.label) : null,
      h('div', { class: 'day-title' }, day.title || ''),
      day.date ? h('div', { class: 'day-date' }, fmtDate(day.date)) : null)));
  const beats = h('div', { class: 'beats' });
  (day.beats || []).forEach((b) => beats.append(h('div', { class: 'beat' },
    h('div', { class: 't' }, b.time || ''), h('div', { class: 'x' }, b.text || ''))));
  if ((day.beats || []).length) card.append(beats);
  if (day.fuel) card.append(h('div', { class: 'fuel' },
    h('span', { class: 'lbl' }, '☕'), h('span', {}, h('b', {}, 'Fuel · '), day.fuel)));
  return card;
}

function fmtDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

let selDay = 0;
function viewItinerary(root, plan) {
  root.append(tripHeader(plan));
  const segs = segColors(plan.days);
  const days = plan.days || [];
  if (!days.length) { root.append(h('div', { class: 'section-empty' }, 'No days in this trip yet.')); return; }
  selDay = Math.min(selDay, days.length - 1);

  const wrap = h('div', { class: 'two-pane' });
  const list = h('div', { class: 'day-list' });
  const detail = h('div', { class: 'detail-pane' });
  const paintDetail = () => { detail.replaceChildren(dayCard(days[selDay], segs)); };

  days.forEach((day, i) => {
    const c = dayCard(day, segs);
    if (i === selDay) c.classList.add('sel');
    c.addEventListener('click', () => {
      selDay = i;
      list.querySelectorAll('.day-card').forEach((n, j) => n.classList.toggle('sel', j === i));
      paintDetail();
    });
    list.append(c);
  });
  paintDetail();
  wrap.append(list, detail);
  root.append(wrap);
}

/* ------------------------------------------------------------------ RESERVATIONS */
const RES_TYPES = [
  { key: 'flight', label: 'Flights', ic: '✈️' },
  { key: 'hotel', label: 'Hotels', ic: '🏨' },
  { key: 'car', label: 'Car', ic: '🚗' },
  { key: 'tour', label: 'Tours & tickets', ic: '🎟️' },
  { key: 'restaurant', label: 'Restaurants', ic: '🍽️' },
  { key: 'other', label: 'Other', ic: '📌' },
];
const typeMeta = (t) => RES_TYPES.find((x) => x.key === t) || { label: (t || 'Other'), ic: '📌', key: t || 'other' };

async function viewReservations(root, plan, state) {
  root.append(h('div', { class: 'trip-header' },
    h('div', { class: 'eyebrow' }, 'Offline vault'),
    h('h1', { class: 'page' }, 'Reservations')));
  const list = plan.reservations || [];
  if (!list.length) { root.append(h('div', { class: 'section-empty' }, 'No reservations in this trip.')); return; }

  const groups = {};
  list.forEach((r, i) => { const k = typeMeta(r.type).key; (groups[k] = groups[k] || []).push({ r, i }); });
  const order = RES_TYPES.map((t) => t.key).concat(Object.keys(groups).filter((k) => !RES_TYPES.some((t) => t.key === k)));

  for (const k of order) {
    if (!groups[k]) continue;
    const meta = typeMeta(k);
    const sec = h('div', { class: 'res-group' }, h('h2', {}, h('span', { class: 'ic' }, meta.ic), meta.label));
    const grid = h('div', { class: 'res-grid' });
    for (const { r, i } of groups[k]) grid.append(resCard(r, i, plan, state));
    sec.append(grid);
    root.append(sec);
  }
}

function resCard(r, i, plan, state) {
  const key = resKey(r, i);
  const edit = state.resEdits[key] || {};
  const conf = edit.confirmation != null ? edit.confirmation : (r.confirmation || '');
  const notes = edit.notes != null ? edit.notes : (r.notes || '');

  const card = h('div', { class: 'res-card' });
  card.append(h('div', { class: 'rc-top' },
    h('div', {},
      h('h3', {}, r.name || '(untitled)'),
      r.datetime ? h('div', { class: 'rc-when' }, r.datetime) : null),
    h('span', { class: 'res-type-badge' }, typeMeta(r.type).ic)));

  // confirmation — tap to copy; pencil to edit
  const confWrap = h('div', { class: 'conf-row' });
  confWrap.append(h('div', { class: 'conf-label' }, 'Confirmation'));
  const confBtn = h('button', { class: 'conf-copy', title: 'Tap to copy' },
    h('span', { class: conf ? 'val mono' : 'val empty-val' }, conf || 'Tap edit to add'),
    h('span', { class: 'cp' }, conf ? '⧉ copy' : '✎'));
  confBtn.addEventListener('click', () => {
    if (conf) copyText(conf, confBtn);
    else startEdit('confirmation');
  });
  confWrap.append(confBtn);
  card.append(confWrap);

  if (r.address) {
    card.append(h('div', { class: 'res-field' },
      h('span', { class: 'k' }, 'Address'),
      h('span', {}, r.address)));
  }
  if (notes) card.append(h('div', { class: 'res-note' }, notes));

  const actions = h('div', { class: 'res-actions' });
  if (r.address) actions.append(h('a', {
    href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(r.address),
    target: '_blank', rel: 'noopener',
  }, '📍 Open in Maps'));
  if (r.phone) actions.append(h('a', { href: 'tel:' + String(r.phone).replace(/[^\d+]/g, '') }, '📞 Call'));
  actions.append(h('button', { onclick: () => startEdit('confirmation') }, '✎ Edit'));
  card.append(actions);

  // inline editor for confirmation + notes
  function startEdit(focus) {
    if (card.querySelector('.inline-edit')) return;
    const box = h('div', { class: 'inline-edit', style: 'margin-top:4px' });
    const cInput = h('input', { class: 'edit-field', value: conf, placeholder: 'Confirmation number' });
    const nInput = h('textarea', { class: 'edit-field', placeholder: 'Notes', style: 'margin-top:7px' });
    nInput.value = notes;
    box.append(h('div', { class: 'conf-label', style: 'margin-bottom:5px' }, 'Confirmation'), cInput,
      h('div', { class: 'conf-label', style: 'margin:9px 0 5px' }, 'Notes'), nInput);
    const save = h('button', { class: 'btn small', onclick: async () => {
      state.resEdits[key] = { confirmation: cInput.value.trim(), notes: nInput.value };
      await putState(state);
      toast('Saved');
      render();
    } }, 'Save');
    const cancel = h('button', { class: 'btn small ghost', onclick: () => box.remove() }, 'Cancel');
    box.append(h('div', { class: 'inline-edit-actions' }, save, cancel));
    card.append(box);
    (focus === 'confirmation' ? cInput : nInput).focus();
  }
  return card;
}

async function copyText(text, btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; }
  catch {
    try {
      const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text;
      document.body.append(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
    } catch { ok = false; }
  }
  if (ok && btn) { btn.classList.add('copied'); const cp = btn.querySelector('.cp'); const old = cp.textContent; cp.textContent = '✓ copied'; setTimeout(() => { btn.classList.remove('copied'); cp.textContent = old; }, 1400); }
  toast(ok ? 'Copied' : 'Copy failed — long-press to select');
}

/* ------------------------------------------------------------------ CHECKLISTS */
function countChecklistItems(plan, state) {
  let total = 0, done = 0;
  for (const cl of plan.checklists || []) {
    const items = mergedChecklistItems(cl, state);
    for (const it of items) { total++; if (state.checkTicks[it.key]) done++; }
  }
  return { total, done, remaining: total - done };
}
function mergedChecklistItems(cl, state) {
  const out = [];
  (cl.items || []).forEach((raw) => {
    const key = checkKey(cl.name, raw);
    if (state.checkRemoved[key]) return;
    out.push({ key, text: typeof raw === 'object' ? raw.text : raw, custom: false });
  });
  (state.checkCustom[cl.name] || []).forEach((c) => out.push({ key: 'c:' + c.id, text: c.text, custom: true }));
  return out;
}

async function viewChecklists(root, plan, state) {
  root.append(h('div', { class: 'trip-header' },
    h('div', { class: 'eyebrow' }, 'Before you go & on the road'),
    h('h1', { class: 'page' }, 'Checklists')));
  const lists = plan.checklists || [];
  if (!lists.length) { root.append(h('div', { class: 'section-empty' }, 'No checklists in this trip.')); return; }

  for (const cl of lists) {
    const items = mergedChecklistItems(cl, state);
    const done = items.filter((it) => state.checkTicks[it.key]).length;
    const group = h('div', { class: 'check-group' },
      h('h2', {}, h('span', {}, cl.name || 'Checklist'), h('span', { class: 'count mono' }, `${done}/${items.length}`)));

    items.forEach((it) => {
      const row = h('button', { class: 'check-item' + (state.checkTicks[it.key] ? ' done' : '') },
        h('span', { class: 'check-box' }, state.checkTicks[it.key] ? '✓' : ''),
        h('span', { class: 'ci-text' }, it.text),
        it.custom ? h('span', { class: 'ci-del', title: 'Remove', onclick: async (e) => {
          e.stopPropagation();
          state.checkCustom[cl.name] = (state.checkCustom[cl.name] || []).filter((c) => 'c:' + c.id !== it.key);
          delete state.checkTicks[it.key];
          await putState(state); render();
        } }, '✕') : null);
      row.addEventListener('click', async () => {
        if (state.checkTicks[it.key]) delete state.checkTicks[it.key]; else state.checkTicks[it.key] = true;
        await putState(state); render();
      });
      group.append(row);
    });

    // add custom item
    const input = h('input', { placeholder: 'Add an item…', 'aria-label': 'Add checklist item' });
    const addItem = async () => {
      const text = input.value.trim(); if (!text) return;
      state.checkCustom[cl.name] = state.checkCustom[cl.name] || [];
      state.checkCustom[cl.name].push({ id: hash32(text + Date.now() + Math.random()), text });
      await putState(state); render();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addItem(); });
    group.append(h('div', { class: 'check-add' }, input, h('button', { class: 'btn small', onclick: addItem }, 'Add')));
    root.append(group);
  }
}

/* ------------------------------------------------------------------ DOCS */
async function viewDocs(root, plan) {
  const head = h('div', { class: 'docs-head' },
    h('div', {}, h('div', { class: 'eyebrow' }, 'Boarding passes · confirmations · photos'),
      h('h1', { class: 'page' }, 'Docs')),
    h('button', { class: 'btn', onclick: () => openDocPicker(plan.trip.id) }, '＋ Add'));
  root.append(head);
  root.append(h('div', { class: 'ios-hint', style: 'margin:0 0 16px' }, h('span', {}, '🔒'),
    h('span', { html: 'Docs stay <b>on this device only</b> — they are never shared. Keep the originals too; rarely, iOS may clear unused app storage.' })));

  const docs = (await docsForTrip(plan.trip.id)).sort((a, b) => (b.added || 0) - (a.added || 0));
  if (!docs.length) { root.append(h('div', { class: 'section-empty' }, 'No documents yet. Add a boarding pass or hotel confirmation — it stays readable offline.')); return; }

  const grid = h('div', { class: 'doc-grid' });
  const resByKey = {};
  (plan.reservations || []).forEach((r, i) => { resByKey[resKey(r, i)] = r; });
  for (const doc of docs) {
    const tile = h('div', { class: 'doc-tile' });
    if ((doc.type || '').startsWith('image/')) {
      tile.append(h('img', { src: objURL(doc.blob), alt: doc.name, loading: 'lazy' }));
    } else {
      tile.append(h('span', { class: 'pdf-ic' }, '📄'));
    }
    if (doc.resId && resByKey[doc.resId]) tile.append(h('span', { class: 'doc-attach' }, resByKey[doc.resId].name));
    tile.append(h('span', { class: 'doc-name' }, doc.name || 'document'));
    tile.append(h('button', { class: 'doc-del', title: 'Delete', onclick: async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this document?')) return;
      await deleteDoc(doc.docId); toast('Deleted'); render();
    } }, '🗑'));
    tile.addEventListener('click', () => openLightbox(doc));
    grid.append(tile);
  }
  root.append(grid);
}

let pendingTripForDoc = null;
function openDocPicker(tripId) { pendingTripForDoc = tripId; $('#doc-input').click(); }
$('#doc-input').addEventListener('change', async (e) => {
  const files = [...e.target.files]; e.target.value = '';
  if (!files.length || !pendingTripForDoc) return;
  for (const f of files) {
    await addDoc({ tripId: pendingTripForDoc, resId: null, name: f.name, type: f.type || 'application/octet-stream', blob: f, added: Date.now() });
  }
  toast(files.length > 1 ? files.length + ' documents added' : 'Document added');
  render();
});

function openLightbox(doc) {
  const box = $('#lightbox'), body = $('#lightbox-body');
  body.replaceChildren();
  const url = objURL(doc.blob);
  if ((doc.type || '').startsWith('image/')) body.append(h('img', { src: url, alt: doc.name }));
  else body.append(h('iframe', { src: url, title: doc.name }));
  box.hidden = false;
}
$('#lightbox-close').addEventListener('click', () => { $('#lightbox').hidden = true; $('#lightbox-body').replaceChildren(); });
$('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') { $('#lightbox').hidden = true; $('#lightbox-body').replaceChildren(); } });

/* ------------------------------------------------------------------ SHARE / EXPORT */
async function shareTrip(id) {
  const plan = await getTrip(id);
  if (!plan) return;
  const state = await getState(id);
  const hasConf = Object.values(state.resEdits || {}).some((e) => e.confirmation);
  // export = the plan only by default (personal docs/confirmations stay local).
  const out = JSON.parse(JSON.stringify({ schemaVersion: 1, trip: plan.trip, days: plan.days, reservations: plan.reservations, checklists: plan.checklists }));
  if (hasConf && confirm('Include the confirmation numbers you\'ve typed in?\n\nOK = include them in the shared file.\nCancel = share the plan only (recommended).')) {
    out.reservations = (out.reservations || []).map((r, i) => {
      const e = state.resEdits[resKey(r, i)];
      return e && e.confirmation ? { ...r, confirmation: e.confirmation } : r;
    });
  }
  const json = JSON.stringify(out, null, 2);
  const fname = (plan.trip.id || 'trip') + '.json';
  const file = new File([json], fname, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: plan.trip.title, text: 'My Waypoint trip: ' + plan.trip.title }); return; }
    catch (err) { if (err && err.name === 'AbortError') return; /* fall through */ }
  }
  // fallback: download the file
  try {
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: fname }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Trip file saved — send it however you like');
  } catch {
    try { await navigator.clipboard.writeText(json); toast('Trip copied to clipboard'); }
    catch { toast('Could not export on this device'); }
  }
}

/* ------------------------------------------------------------------ boot */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
// re-render on breakpoint cross so the tabbar moves between rail and bottom bar
let wasWide = window.matchMedia('(min-width:800px)').matches;
window.matchMedia('(min-width:800px)').addEventListener('change', (e) => { wasWide = e.matches; render(); });

// seed the sample trip on very first run so the app isn't empty out of the box
(async function boot() {
  try {
    const trips = await allTrips();
    if (!trips.length && !lsGet('wp_seeded', '')) {
      lsSet('wp_seeded', '1');
      try {
        const res = await fetch('trips/california-2026.json');
        if (res.ok) { const plan = validatePlan(await res.json()); await putTrip(plan); }
      } catch { /* offline first load with no sample — fine */ }
    }
  } catch (e) { console.error(e); }
  render();
})();
