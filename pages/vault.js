'use strict';
// vault.js — Vault UI logic (runs in pages/vault.html)

// ── Helpers ───────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const send = (type, data = {}) =>
  chrome.runtime.sendMessage({ type, ...data });


// ── Page-side IndexedDB (mirrors providers/vault.js) ─────────────────────────
const _IDB_DB    = 'captain-vault';
const _IDB_STORE = 'handles';
const _IDB_KEY   = 'kdbx-handle';

function _openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(_IDB_DB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(_IDB_STORE);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}
async function _saveHandle(handle) {
  const db = await _openIDB();
  const tx = db.transaction(_IDB_STORE, 'readwrite');
  tx.objectStore(_IDB_STORE).put(handle, _IDB_KEY);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
}
async function _pickFile() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'KeePass Database', accept: { 'application/octet-stream': ['.kdbx'] } }],
    });
    await _saveHandle(handle);
    return { ok: true, name: handle.name };
  } catch (e) {
    if (String(e).includes('AbortError') || String(e).includes('abort')) return { ok: false, cancelled: true };
    return { ok: false, error: String(e) };
  }
}


let _entries = [];   // full entry list (no passwords except via get-password)
let _fileName = '';

// Inject copy-flash animation style once
document.head.insertAdjacentHTML('beforeend', '<style>@keyframes fadeout{to{opacity:0}}</style>');

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const status = await send('vault:status');
  if (status.unlocked) {
    if (status.fileName) _fileName = status.fileName;
    await enterUnlocked();
  } else {
    showUnlock();
    await checkFileSelected();
  }
}

async function checkFileSelected() {
  // Try to determine if a file is already bound (silently attempt to read status)
  // We can't read the IDB directly from the page, so just show a hint if locked
  $('file-hint').textContent = '';
}

// ── Unlock screen ─────────────────────────────────────────────────────────────
function showUnlock() {
  $('unlock-screen').style.display = 'flex';
  $('main-screen').style.display   = 'none';
  $('btn-lock').style.display      = 'none';
  $('lock-badge').textContent      = 'Locked';
  $('lock-badge').className        = 'badge locked';
  setTimeout(() => $('master-pw').focus(), 50);
}

async function enterUnlocked() {
  $('unlock-screen').style.display = 'none';
  $('main-screen').style.display   = 'flex';
  $('btn-lock').style.display      = 'inline-block';
  $('lock-badge').textContent      = 'Unlocked';
  $('lock-badge').className        = 'badge';
  await refreshEntries();
}

// ── Password visibility toggle ────────────────────────────────────────────────
function makeToggle(btnId, inputId) {
  $(`${btnId}`).addEventListener('click', () => {
    const inp = $(inputId);
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    $(btnId).textContent = show ? 'Hide' : 'Show';
  });
}
makeToggle('toggle-unlock-pw', 'master-pw');
makeToggle('toggle-pw', 'entry-password');

// ── Unlock flow ───────────────────────────────────────────────────────────────
async function tryUnlock() {
  const pw = $('master-pw').value;
  if (!pw) { $('unlock-error').textContent = 'Enter your master password.'; return; }
  $('unlock-error').textContent = '';
  $('btn-unlock').disabled = true;
  $('btn-unlock').textContent = 'Unlocking…';
  const res = await send('vault:unlock', { password: pw });
  $('btn-unlock').disabled = false;
  $('btn-unlock').textContent = 'Unlock';
  if (res.ok) {
    $('master-pw').value = '';
    await enterUnlocked();
  } else if (res.error === 'no_file') {
    $('unlock-error').textContent = 'No vault file selected. Click "Select .kdbx file" first.';
  } else if (res.error === 'bad_password') {
    $('unlock-error').textContent = 'Wrong password or corrupt file.';
    $('master-pw').select();
  } else {
    $('unlock-error').textContent = res.msg || 'Unlock failed.';
  }
}

$('btn-unlock').addEventListener('click', tryUnlock);
$('master-pw').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });

$('btn-select-file').addEventListener('click', async () => {
  const res = await _pickFile();
  if (res.ok) {
    $('file-hint').textContent = `✓ File selected: ${res.name}`;
    _fileName = res.name;
  } else if (!res.cancelled) {
    $('file-hint').textContent = `Error: ${res.error}`;
  }
});

// ── Lock ──────────────────────────────────────────────────────────────────────
$('btn-lock').addEventListener('click', async () => {
  await send('vault:lock');
  _entries = [];
  showUnlock();
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${tab}`).classList.add('active');
  });
});

// ── Entry list ────────────────────────────────────────────────────────────────
async function refreshEntries(query = '') {
  const res = await send('vault:search', { query });
  if (!res.ok) { showUnlock(); return; }
  _entries = res.entries;
  renderEntries(_entries);
}

function faviconUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return `https://www.google.com/s2/favicons?sz=32&domain=${u.hostname}`;
  } catch { return ''; }
}

function renderEntries(entries) {
  const list = $('entry-list');
  if (!entries.length) {
    list.innerHTML = '<div class="empty-state">No entries found.</div>';
    return;
  }
  list.innerHTML = '';
  for (const e of entries) {
    const item = document.createElement('div');
    item.className = 'entry-item';
    item.dataset.uuid = e.uuid;

    const fav = faviconUrl(e.url);
    const avatarInner = fav
      ? `<img src="${fav}" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
        + `<span style="display:none">🔑</span>`
      : '🔑';

    item.innerHTML = `
      <div class="entry-avatar">${avatarInner}</div>
      <div class="entry-info">
        <div class="entry-title">${esc(e.title || '(no title)')}</div>
        <div class="entry-sub">${esc(e.username || e.url || '')}</div>
      </div>
      <div class="entry-actions">
        <button class="icon-btn" title="Copy username" data-action="copy-user">👤</button>
        <button class="icon-btn" title="Copy password" data-action="copy-pw">🔑</button>
        <button class="icon-btn" title="Edit"          data-action="edit">✏️</button>
      </div>`;

    item.querySelector('[data-action=copy-user]').addEventListener('click', e2 => {
      e2.stopPropagation();
      copyText(e.username || '');
    });
    item.querySelector('[data-action=copy-pw]').addEventListener('click', async e2 => {
      e2.stopPropagation();
      const r = await send('vault:get-password', { uuid: e.uuid });
      if (r.ok) copyText(r.password);
    });
    item.querySelector('[data-action=edit]').addEventListener('click', e2 => {
      e2.stopPropagation();
      openModal(e);
    });
    item.addEventListener('click', () => openModal(e));
    list.appendChild(item);
  }
}

// ── Search ────────────────────────────────────────────────────────────────────
let _searchTimer = null;
$('search-input').addEventListener('input', e => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => refreshEntries(e.target.value.trim()), 180);
});

// ── Copy helper ───────────────────────────────────────────────────────────────
function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  });
  // Visual flash
  const orig = document.activeElement;
  const flash = document.createElement('div');
  flash.textContent = 'Copied!';
  flash.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
    'background:#22c55e;color:#fff;padding:8px 20px;border-radius:20px;font-size:13px;' +
    'font-weight:600;z-index:9999;pointer-events:none;animation:fadeout .8s .8s forwards';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1700);
}

// ── Modal (add / edit) ────────────────────────────────────────────────────────
function openModal(entry = null) {
  $('modal-title').textContent = entry ? 'Edit Entry' : 'Add Entry';
  $('entry-uuid').value     = entry?.uuid    ?? '';
  $('entry-title').value    = entry?.title   ?? '';
  $('entry-username').value = entry?.username ?? '';
  $('entry-password').value = '';   // never pre-fill password field from cache
  $('entry-url').value      = entry?.url     ?? '';
  $('entry-notes').value    = entry?.notes   ?? '';
  $('modal-error').textContent = '';
  $('btn-modal-delete').style.display = entry ? 'inline-block' : 'none';

  // If editing, load the actual password
  if (entry) {
    send('vault:get-password', { uuid: entry.uuid }).then(r => {
      if (r.ok) $('entry-password').value = r.password;
    });
  }
  $('modal-bg').classList.remove('hidden');
  setTimeout(() => $('entry-title').focus(), 30);
}

function closeModal() { $('modal-bg').classList.add('hidden'); }

$('btn-modal-cancel').addEventListener('click', closeModal);
$('modal-bg').addEventListener('click', e => { if (e.target === $('modal-bg')) closeModal(); });

$('btn-add').addEventListener('click', () => openModal(null));

$('btn-modal-save').addEventListener('click', async () => {
  const title = $('entry-title').value.trim();
  if (!title) { $('modal-error').textContent = 'Title is required.'; return; }
  $('modal-error').textContent = '';
  $('btn-modal-save').disabled = true;
  $('btn-modal-save').textContent = 'Saving…';

  const entry = {
    uuid:     $('entry-uuid').value || undefined,
    title:    title,
    username: $('entry-username').value.trim(),
    password: $('entry-password').value,
    url:      $('entry-url').value.trim(),
    notes:    $('entry-notes').value.trim(),
  };
  const res = await send('vault:save-entry', { entry });
  $('btn-modal-save').disabled = false;
  $('btn-modal-save').textContent = 'Save';
  if (res.ok) {
    closeModal();
    await refreshEntries($('search-input').value.trim());
  } else {
    $('modal-error').textContent = res.msg || 'Save failed.';
  }
});

$('btn-modal-delete').addEventListener('click', async () => {
  const uuid = $('entry-uuid').value;
  if (!uuid) return;
  if (!confirm('Delete this entry? This cannot be undone.')) return;
  const res = await send('vault:delete-entry', { uuid });
  if (res.ok) {
    closeModal();
    await refreshEntries($('search-input').value.trim());
  } else {
    $('modal-error').textContent = res.msg || 'Delete failed.';
  }
});

// ── Settings modal ────────────────────────────────────────────────────────────
$('btn-settings').addEventListener('click', async () => {
  $('settings-file-name').textContent = _fileName || '(unknown)';
  $('settings-file-name').className   = 'file-name' + (_fileName ? ' set' : '');
  $('settings-bg').classList.remove('hidden');
});
$('btn-settings-close').addEventListener('click', () => $('settings-bg').classList.add('hidden'));
$('settings-bg').addEventListener('click', e => { if (e.target === $('settings-bg')) $('settings-bg').classList.add('hidden'); });

$('btn-change-file').addEventListener('click', async () => {
  const res = await _pickFile();
  if (res.ok) {
    _fileName = res.name;
    $('settings-file-name').textContent = _fileName;
    $('settings-file-name').className   = 'file-name set';
  }
});

$('btn-forget-file').addEventListener('click', async () => {
  if (!confirm('This will remove the file link and lock the vault. Continue?')) return;
  await send('vault:forget-file');
  _entries  = [];
  _fileName = '';
  $('settings-bg').classList.add('hidden');
  showUnlock();
});

// ── Password generator ────────────────────────────────────────────────────────
const GEN_CHARS = {
  upper:   'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower:   'abcdefghjkmnpqrstuvwxyz',
  digits:  '23456789',
  symbols: '!@#$%^&*()-_=+[]{}|;:,.<>?',
};

function generatePassword() {
  const len    = +$('gen-len').value;
  const pools  = [];
  if ($('gen-upper').checked)   pools.push(GEN_CHARS.upper);
  if ($('gen-lower').checked)   pools.push(GEN_CHARS.lower);
  if ($('gen-digits').checked)  pools.push(GEN_CHARS.digits);
  if ($('gen-symbols').checked) pools.push(GEN_CHARS.symbols);
  if (!pools.length) return '';
  const all   = pools.join('');
  // Guarantee at least one char from each pool
  const arr   = pools.map(p => p[randInt(p.length)]);
  while (arr.length < len) arr.push(all[randInt(all.length)]);
  // Shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

function randInt(n) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % n;
}

$('gen-len').addEventListener('input', () => {
  $('gen-len-val').textContent = $('gen-len').value;
});

$('btn-generate').addEventListener('click', () => {
  const pw = generatePassword();
  $('gen-output').textContent = pw || '(select at least one character type)';
});

$('btn-copy-gen').addEventListener('click', () => {
  const pw = $('gen-output').textContent;
  if (pw && !pw.startsWith('(')) copyText(pw);
});

// ── Escape helper ─────────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
