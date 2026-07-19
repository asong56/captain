// providers/annotate.js — Unified annotation & export
// Merges Hypothesis (annotation) + MarkSnip (capture/export) into one seamless flow.
// The user just highlights → notes → exports. No plugin names visible.

import { register } from '../core/registry.js';
import { get, set } from '../core/storage.js';
import { expose, emit } from '../core/bus.js';

const KEY_ANNOTATIONS  = 'c.annotate.all';  // { pageUrl -> [annotation] }
const KEY_EXPORT_FOLDER = 'c.annotate.exportFolder'; // FileSystemDirectoryHandle via IDB

// ── IDB for directory handle ─────────────────────────────────────────────────
const IDB_DB    = 'captain-annotate';
const IDB_STORE = 'handles';
const IDB_KEY   = 'export-folder';

function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

async function saveHandle(handle) {
  const db = await openIDB();
  const tx = db.transaction(IDB_STORE, 'readwrite');
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

// ── Annotation storage ────────────────────────────────────────────────────────
async function loadAnnotations() {
  return (await get(KEY_ANNOTATIONS)) || {};
}

async function saveAnnotations(all) {
  return set(KEY_ANNOTATIONS, all);
}

async function getPageAnnotations(url) {
  const normalized = normalizeUrl(url);
  const all = await loadAnnotations();
  return all[normalized] || [];
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch { return url; }
}

// ── HTML → Markdown conversion (minimal, no deps) ────────────────────────────
function htmlToMarkdown(html) {
  // Simple HTML stripping with basic markdown conversion
  return html
    .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_, n, t) => '#'.repeat(+n) + ' ' + t.trim() + '\n\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Export ────────────────────────────────────────────────────────────────────
async function exportAnnotations(url, options = {}) {
  const {
    includeOriginal  = true,
    includeAnnotations = true,
    includeMetadata  = true,
    toAI             = false,
  } = options;

  const annotations = await getPageAnnotations(url);

  // Get page metadata from the active tab
  let pageTitle = url, pageContent = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      pageTitle = tab.title || url;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.content || '',
          author: document.querySelector('meta[name="author"]')?.content || '',
          content: document.body.innerText.slice(0, 50000),
          html: document.body.innerHTML.slice(0, 200000),
          date: new Date().toISOString(),
        }),
      });
      if (results?.[0]?.result) {
        const meta = results[0].result;
        pageTitle   = meta.title || url;
        pageContent = includeOriginal ? meta.content : '';
      }
    }
  } catch {}

  // Build export document
  const lines = [];
  if (includeMetadata) {
    lines.push(`# ${pageTitle}`, '', `**Source:** ${url}`, `**Exported:** ${new Date().toLocaleString()}`, '');
  }
  if (includeAnnotations && annotations.length) {
    lines.push('## My Annotations', '');
    for (const ann of annotations) {
      lines.push(`> ${ann.selectedText}`, '');
      if (ann.note) lines.push(ann.note, '');
      lines.push('---', '');
    }
  }
  if (includeOriginal && pageContent) {
    lines.push('## Original Content', '', pageContent);
  }

  const markdown = lines.join('\n');

  if (toAI) {
    // Send to AI panel
    emit('annotate:export-to-ai', { markdown, url, title: pageTitle, annotations });
    return { ok: true, destination: 'ai' };
  }

  // Save to folder
  try {
    let handle = await loadHandle();
    if (!handle) {
      // Prompt user to pick folder
      handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await saveHandle(handle);
    }
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      // Can't request permission from service worker; ask content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'annotate:request-folder-permission' });
      }
      return { ok: false, error: 'Folder permission needed — please click the export button again in the page.' };
    }

    const safeTitle = pageTitle.replace(/[^a-z0-9\-_\s]/gi, '').trim().slice(0, 60) || 'export';
    const filename  = `${safeTitle}-${Date.now()}.md`;
    const file = await handle.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    await writable.write(markdown);
    await writable.close();
    return { ok: true, destination: 'file', filename };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
export async function init() {
  register('annotate', async (q) => {
    const match = t => !q || t.toLowerCase().includes(q.toLowerCase());
    const items = [];
    if (match('annotate highlight notes export'))
      items.push({ id: 'annotate:open-options', title: 'Annotations: View all notes',
        desc: 'Browse and export your annotations', emoji: '📝', type: 'action' });
    if (match('export annotations page'))
      items.push({ id: 'annotate:export', title: 'Export this page',
        desc: 'Save page + annotations to a file', emoji: '📤', type: 'action' });
    return items;
  });

  expose('annotate', {
    getForPage:  getPageAnnotations,
    getAll:      loadAnnotations,
    add:         async (annotation) => {
      const all = await loadAnnotations();
      const key = normalizeUrl(annotation.url);
      const id  = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const ann = { id, ...annotation, createdAt: Date.now() };
      all[key] = [...(all[key] || []), ann];
      await saveAnnotations(all);
      emit('annotate:added', ann);
      return ann;
    },
    update:      async (id, patch) => {
      const all = await loadAnnotations();
      for (const key in all) {
        const idx = all[key].findIndex(a => a.id === id);
        if (idx >= 0) {
          all[key][idx] = { ...all[key][idx], ...patch, updatedAt: Date.now() };
          await saveAnnotations(all);
          return all[key][idx];
        }
      }
      throw new Error('Annotation not found');
    },
    delete:      async (id) => {
      const all = await loadAnnotations();
      for (const key in all) {
        const orig = all[key];
        all[key] = orig.filter(a => a.id !== id);
        if (all[key].length !== orig.length) {
          await saveAnnotations(all);
          return;
        }
      }
    },
    export:      exportAnnotations,
    setExportFolder: async () => {
      // showDirectoryPicker must run in a page context (not the background service worker).
      // The options page handles this directly via its own JS.
      return { ok: false, error: 'Call showDirectoryPicker from the options page.' };
    },

  });

  // Listen for content script messages
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg.type === 'annotate:add') {
      const url = sender.tab?.url || msg.url;
      const all_load = loadAnnotations();
      all_load.then(all => {
        const key = normalizeUrl(url);
        const id  = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const ann = { id, url, selectedText: msg.selectedText, note: msg.note || '',
          color: msg.color || '#ffff00', createdAt: Date.now() };
        all[key] = [...(all[key] || []), ann];
        saveAnnotations(all).then(() => {
          emit('annotate:added', ann);
          respond({ ok: true, annotation: ann });
        });
      });
      return true;
    }
    if (msg.type === 'annotate:get-for-page') {
      getPageAnnotations(msg.url).then(anns => respond({ ok: true, annotations: anns }));
      return true;
    }
    if (msg.type === 'annotate:delete') {
      const all_load = loadAnnotations();
      all_load.then(all => {
        for (const key in all) all[key] = all[key].filter(a => a.id !== msg.id);
        saveAnnotations(all).then(() => respond({ ok: true }));
      });
      return true;
    }
  });
}

export const handlers = {
  'annotate:export': async (msg, sender) => {
    const url = msg.url || sender?.tab?.url;
    return exportAnnotations(url, msg.options || {});
  },
  'annotate:open-options': async () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/options.html#annotate') });
    return { ok: true };
  },
};
