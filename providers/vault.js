// providers/vault.js — Local .kdbx password manager
// Zero backend, zero network. kdbxweb parses the file in-extension.
// Vault data lives only in chrome.storage.session (cleared on browser close).
// File handle persisted in IndexedDB for re-open without picker.

import { register } from '../core/registry.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const IDB_DB   = 'captain-vault';
const IDB_STORE = 'handles';
const IDB_KEY   = 'kdbx-handle';
// Session key: only survives until browser is closed
const SESSION_KEY = 'vault.unlocked';

// ── kdbxweb dynamic loader ────────────────────────────────────────────────────
// We load kdbxweb lazily from the extension's lib/ folder (bundled at build),
// or fall back to CDN for development. For production, bundle kdbxweb into
// lib/kdbxweb.js. The library uses Web Crypto so no external dependencies.
let _kdbxweb = null;
async function getKdbxweb() {
  if (_kdbxweb) return _kdbxweb;
  // Try local bundle first
  const localUrl = chrome.runtime.getURL('lib/kdbxweb.js');
  try {
    _kdbxweb = await import(localUrl);
    return _kdbxweb;
  } catch {}
  throw new Error('kdbxweb not found. Add lib/kdbxweb.js to the extension.');
}

// ── IndexedDB handle store ────────────────────────────────────────────────────
function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

async function saveHandle(handle) {
  const db  = await openIDB();
  const tx  = db.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
}

async function loadHandle() {
  const db  = await openIDB();
  const tx  = db.transaction(IDB_STORE, 'readonly');
  const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result ?? null);
    req.onerror   = () => rej(req.error);
  });
}

async function clearHandle() {
  const db = await openIDB();
  const tx = db.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).delete(IDB_KEY);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
}

// ── Session vault store ───────────────────────────────────────────────────────
// Stores {entries: [{title,username,password,url,notes}], locked: bool}
// chrome.storage.session is cleared when all extension pages close / browser exits
async function sessionGet() {
  const r = await chrome.storage.session.get(SESSION_KEY);
  return r[SESSION_KEY] ?? null;
}
async function sessionSet(data) {
  await chrome.storage.session.set({ [SESSION_KEY]: data });
}
async function sessionClear() {
  await chrome.storage.session.remove(SESSION_KEY);
}

// ── Domain matching ───────────────────────────────────────────────────────────
function extractDomain(urlStr) {
  try { return new URL(urlStr).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

function entriesForDomain(entries, hostname) {
  if (!hostname || !entries) return [];
  const h = hostname.toLowerCase().replace(/^www\./, '');
  return entries.filter(e => {
    if (!e.url) return false;
    const ed = extractDomain(e.url);
    return ed && (ed === h || h.endsWith('.' + ed) || ed.endsWith('.' + h));
  });
}

// ── File reading ──────────────────────────────────────────────────────────────
async function readFileBytes(handle) {
  const perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
    const req = await handle.requestPermission({ mode: 'readwrite' });
    if (req !== 'granted') throw new Error('File permission denied');
  }
  const file   = await handle.getFile();
  const buffer = await file.arrayBuffer();
  return buffer;
}

// ── kdbxweb parsing ───────────────────────────────────────────────────────────
async function parseKdbx(buffer, password, keyFileBuffer) {
  const kdbxweb  = await getKdbxweb();
  const creds    = new kdbxweb.Credentials(
    kdbxweb.ProtectedValue.fromString(password),
    keyFileBuffer ? kdbxweb.Credentials.createKeyFileCredentials(keyFileBuffer) : null,
  );
  const db       = await kdbxweb.Kdbx.load(buffer, creds);
  return db;
}

function dbToEntries(db) {
  const entries = [];
  function walk(group) {
    for (const entry of group.entries) {
      const f = entry.fields;
      entries.push({
        uuid:     entry.uuid.id,
        title:    f.get('Title')?.getText?.()   ?? f.get('Title')    ?? '',
        username: f.get('UserName')?.getText?.() ?? f.get('UserName') ?? '',
        password: f.get('Password')?.getText?.() ?? '',   // unwrap ProtectedValue
        url:      f.get('URL')?.getText?.()      ?? f.get('URL')      ?? '',
        notes:    f.get('Notes')?.getText?.()    ?? f.get('Notes')    ?? '',
        group:    group.name,
      });
    }
    for (const sub of group.groups) walk(sub);
  }
  walk(db.getDefaultGroup());
  return entries;
}

// ── Re-serialise and write back ────────────────────────────────────────────────
async function writeKdbx(db, handle) {
  const buffer  = await db.save();
  const writable = await handle.createWritable();
  await writable.write(buffer);
  await writable.close();
}

// ── In-memory DB reference (for writes) ──────────────────────────────────────
// Only held while unlocked; nulled on lock.
let _openDb     = null;
let _openHandle = null;

// ── Core operations ───────────────────────────────────────────────────────────
async function unlock(password, keyFileBuffer) {
  let handle = await loadHandle();
  if (!handle) return { ok: false, error: 'no_file', msg: 'No vault file selected. Use vault:open first.' };
  let buffer;
  try { buffer = await readFileBytes(handle); }
  catch (e) { return { ok: false, error: 'permission', msg: String(e) }; }
  let db;
  try { db = await parseKdbx(buffer, password, keyFileBuffer); }
  catch (e) { return { ok: false, error: 'bad_password', msg: 'Wrong password or corrupt file.' }; }

  const entries = dbToEntries(db);
  await sessionSet({ entries, locked: false });
  _openDb     = db;
  _openHandle = handle;
  return { ok: true, count: entries.length };
}

async function lock() {
  _openDb     = null;
  _openHandle = null;
  await sessionClear();
  return { ok: true };
}

async function getStatus() {
  const s = await sessionGet();
  if (!s || s.locked) return { unlocked: false };
  return { unlocked: true, count: s.entries?.length ?? 0, fileName: _openHandle?.name || '' };
}

async function getEntriesForHostname(hostname) {
  const s = await sessionGet();
  if (!s || s.locked) return { ok: false, locked: true };
  // Strip passwords — caller uses vault:get-password for the actual secret
  const entries = entriesForDomain(s.entries, hostname)
    .map(({ password: _, ...e }) => e);
  return { ok: true, entries };
}

async function searchEntries(query) {
  const s = await sessionGet();
  if (!s || s.locked) return { ok: false, locked: true };
  const q = (query || '').toLowerCase();
  const hits = q
    ? (s.entries || []).filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q))
    : (s.entries || []);
  // Never return passwords in search results — user copies from vault page
  return { ok: true, entries: hits.map(({ password: _, ...e }) => e) };
}

// Add or update an entry and persist to disk
async function saveEntry(entry) {
  if (!_openDb || !_openHandle) return { ok: false, error: 'locked' };
  const kdbxweb = await getKdbxweb();
  const defGroup = _openDb.getDefaultGroup();

  let kdbxEntry;
  if (entry.uuid) {
    // Find existing
    function findEntry(group) {
      for (const e of group.entries) if (e.uuid.id === entry.uuid) return e;
      for (const g of group.groups) { const r = findEntry(g); if (r) return r; }
      return null;
    }
    kdbxEntry = findEntry(defGroup);
  }
  if (!kdbxEntry) {
    kdbxEntry = _openDb.createEntry(defGroup);
  }

  const set = (key, val) => {
    if (key === 'Password') {
      kdbxEntry.fields.set(key, kdbxweb.ProtectedValue.fromString(val));
    } else {
      kdbxEntry.fields.set(key, val);
    }
  };
  set('Title',    entry.title    ?? '');
  set('UserName', entry.username ?? '');
  set('Password', entry.password ?? '');
  set('URL',      entry.url      ?? '');
  set('Notes',    entry.notes    ?? '');

  try { await writeKdbx(_openDb, _openHandle); }
  catch (e) { return { ok: false, error: 'write_failed', msg: String(e) }; }

  // Refresh session
  const entries = dbToEntries(_openDb);
  await sessionSet({ entries, locked: false });
  return { ok: true, uuid: kdbxEntry.uuid.id };
}

async function deleteEntry(uuid) {
  if (!_openDb || !_openHandle) return { ok: false, error: 'locked' };
  function findAndRemove(group) {
    const idx = group.entries.findIndex(e => e.uuid.id === uuid);
    if (idx >= 0) { _openDb.remove(group.entries[idx]); return true; }
    for (const g of group.groups) if (findAndRemove(g)) return true;
    return false;
  }
  if (!findAndRemove(_openDb.getDefaultGroup())) return { ok: false, error: 'not_found' };
  try { await writeKdbx(_openDb, _openHandle); }
  catch (e) { return { ok: false, error: 'write_failed', msg: String(e) }; }
  const entries = dbToEntries(_openDb);
  await sessionSet({ entries, locked: false });
  return { ok: true };
}

// ── Provider registration ─────────────────────────────────────────────────────
export async function init() {
  register('vault', async (q) => {
    const match = t => !q || t.toLowerCase().includes(q.toLowerCase());
    const status = await getStatus();
    const items  = [];

    if (!status.unlocked) {
      if (match('vault password manager unlock'))
        items.push({ id: 'vault:open-ui', title: 'Vault: Open password manager',
          desc: 'Unlock your local .kdbx vault', emoji: '🔐', type: 'action' });
    } else {
      if (match('vault lock'))
        items.push({ id: 'vault:lock', title: 'Vault: Lock',
          desc: `${status.count} entries loaded — click to lock`, emoji: '🔒', type: 'action' });
      if (match('vault open password manager'))
        items.push({ id: 'vault:open-ui', title: 'Vault: Open',
          desc: 'Browse and fill passwords', emoji: '🔐', type: 'action' });
    }

    // If unlocked and there's a query, search entries
    if (status.unlocked && q) {
      const res = await searchEntries(q);
      if (res.ok) {
        for (const e of res.entries.slice(0, 5)) {
          items.push({
            id:    `vault:fill:${e.uuid}`,
            title: e.title || e.url,
            desc:  e.username || 'No username',
            emoji: '🔑',
            type:  'action',
          });
        }
      }
    }
    return items;
  });
}

// ── Message handlers ──────────────────────────────────────────────────────────
export const handlers = {
  // Unlock: { type:'vault:unlock', password, keyFile? (ArrayBuffer base64) }
  'vault:unlock': async (msg) => {
    const keyBuf = msg.keyFile ? _b64ToBuffer(msg.keyFile) : null;
    return unlock(msg.password, keyBuf);
  },

  'vault:lock': async () => lock(),

  'vault:status': async () => getStatus(),

  // Returns entries matching the current tab's hostname, passwords included
  'vault:for-hostname': async (msg) => getEntriesForHostname(msg.hostname),

  // Returns entries matching query, passwords omitted
  'vault:search': async (msg) => searchEntries(msg.query),

  // Returns a single entry's password (requires unlocked)
  'vault:get-password': async (msg) => {
    const s = await sessionGet();
    if (!s || s.locked) return { ok: false, locked: true };
    const e = (s.entries || []).find(e => e.uuid === msg.uuid);
    if (!e) return { ok: false, error: 'not_found' };
    return { ok: true, password: e.password };
  },

  'vault:save-entry': async (msg) => saveEntry(msg.entry),

  'vault:delete-entry': async (msg) => deleteEntry(msg.uuid),

  'vault:forget-file': async () => {
    await Promise.all([clearHandle(), lock()]);
    return { ok: true };
  },

  'vault:open-ui': async () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/vault.html') });
    return { ok: true };
  },

  // Content-script autofill trigger
  'vault:fill': async (msg) => {
    // msg.uuid — triggered from command palette action
    const s = await sessionGet();
    if (!s || s.locked) return { ok: false, locked: true };
    const e = (s.entries || []).find(e => e.uuid === msg.uuid);
    if (!e) return { ok: false, error: 'not_found' };
    // Tell the active content script to fill
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'vault:autofill',
        username: e.username,
        password: e.password,
      }).catch(() => {});
    }
    return { ok: true };
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function _b64ToBuffer(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
