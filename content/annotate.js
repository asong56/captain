// content/annotate.js — Captain annotation layer
// Injected into all pages. Lets users highlight text, add notes, see stored annotations.
// No visible toolbar until needed. Completely seamless.
//
// IIFE wrapper prevents "already declared" errors when Chrome re-injects the
// script on soft-navigations (e.g. SPA route changes) without a full page reload.

(function () {
  'use strict';

  // Guard: if this script has already initialised on this page, skip re-init.
  if (window.__captainAnnotateLoaded) return;
  window.__captainAnnotateLoaded = true;

  let _ctxValid = true;
  let _annotations = [];

  // ── Context-safe messaging ────────────────────────────────────────────────
  function safeSend(msg) {
    if (!_ctxValid) return Promise.resolve(null);
    try {
      return chrome.runtime.sendMessage(msg).catch(err => {
        if (String(err).includes('invalidated')) _ctxValid = false;
        return null;
      });
    } catch (e) {
      if (String(e).includes('invalidated')) _ctxValid = false;
      return Promise.resolve(null);
    }
  }

  // ── Load existing annotations for this page ───────────────────────────────
  async function loadAnnotations() {
    const res = await safeSend({ type: 'annotate:get-for-page', url: location.href });
    if (res?.ok) {
      _annotations = res.annotations;
      renderHighlights();
    }
  }

  // ── Render highlights ─────────────────────────────────────────────────────
  function renderHighlights() {
    document.querySelectorAll('.captain-highlight').forEach(el => {
      el.replaceWith(document.createTextNode(el.textContent));
    });
    for (const ann of _annotations) {
      try { highlightText(ann.selectedText, ann.id, ann.color || '#ffff0066'); } catch {}
    }
  }

  function highlightText(text, annId, color) {
    if (!text) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);

    for (const n of nodes) {
      const idx = n.textContent.indexOf(text);
      if (idx < 0) continue;
      const range = document.createRange();
      range.setStart(n, idx);
      range.setEnd(n, idx + text.length);
      const mark = document.createElement('mark');
      mark.className = 'captain-highlight';
      mark.dataset.annId = annId;
      mark.style.cssText = `background:${color};cursor:pointer;border-radius:2px;`;
      mark.title = 'Click to view note';
      range.surroundContents(mark);
      mark.addEventListener('click', e => { e.stopPropagation(); showNotePopup(annId, mark); });
      break;
    }
  }

  // ── Note popup ────────────────────────────────────────────────────────────
  let _popup = null;

  function showNotePopup(annId, anchor) {
    removePopup();
    const ann = _annotations.find(a => a.id === annId);
    if (!ann) return;

    _popup = document.createElement('div');
    _popup.className = 'captain-note-popup';
    _popup.style.cssText = `
      position:fixed;z-index:2147483646;background:#1a1a2e;color:#e8e8e8;
      border:1px solid #3b7dd8;border-radius:8px;padding:12px 14px;
      font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      max-width:280px;box-shadow:0 8px 32px #0008;
    `;
    const rect = anchor.getBoundingClientRect();
    _popup.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
    _popup.style.top  = `${rect.bottom + 6}px`;

    const selectedText = (ann.selectedText || '').slice(0, 80);
    const ellipsis = (ann.selectedText || '').length > 80 ? '…' : '';
    _popup.innerHTML = `
      <div style="font-size:11px;color:#888;margin-bottom:6px">Annotation</div>
      <div style="font-style:italic;color:#aaa;margin-bottom:8px;font-size:12px">"${esc(selectedText)}${ellipsis}"</div>
      ${ann.note ? `<div style="margin-bottom:10px">${esc(ann.note)}</div>` : '<div style="color:#666;margin-bottom:10px;font-size:12px">No note</div>'}
      <div style="display:flex;gap:8px">
        <button data-action="edit" style="${btnStyle('#3b7dd8')}">Edit note</button>
        <button data-action="delete" style="${btnStyle('#e04040')}">Remove</button>
      </div>
    `;

    _popup.addEventListener('click', async e => {
      const action = e.target.dataset.action;
      if (action === 'delete') {
        await safeSend({ type: 'annotate:delete', id: annId });
        _annotations = _annotations.filter(a => a.id !== annId);
        renderHighlights();
        removePopup();
      }
      if (action === 'edit') {
        const note = prompt('Edit your note:', ann.note || '');
        if (note !== null) {
          await safeSend({ type: 'annotate:add', url: location.href,
            selectedText: ann.selectedText, note, color: ann.color });
          await loadAnnotations();
        }
        removePopup();
      }
    });

    document.body.appendChild(_popup);
    setTimeout(() => document.addEventListener('click', removePopup, { once: true }), 10);
  }

  function removePopup() { _popup?.remove(); _popup = null; }

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function btnStyle(bg) {
    return `background:${bg};color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;`;
  }

  // ── Annotation trigger ───────────────────────────────────────────────────
  // Default: right-click context menu only (non-intrusive).
  // Optional: floating bar on selection (opt-in, disabled by default).
  // Setting key: c.annotate.trigger = 'contextmenu' | 'selectionbar'

  let _trigger      = 'contextmenu'; // loaded from storage, default non-intrusive
  let _selectionBar = null;
  let _lastSel      = { text: '', rect: null }; // remembered for context menu path

  // Load trigger preference (fire-and-forget; defaults apply immediately)
  chrome.storage.local.get('c.annotate.trigger').then(r => {
    _trigger = r['c.annotate.trigger'] || 'contextmenu';
  }).catch(() => {});

  // ── Track selection for both trigger modes ────────────────────────────────
  document.addEventListener('mouseup', (e) => {
    if (!_ctxValid) return;
    if (e.target.closest?.('.captain-note-popup') || e.target.closest?.('.captain-selection-bar')) return;

    const sel  = window.getSelection();
    const text = sel?.toString().trim();

    if (!text || text.length < 2) {
      removeSelectionBar();
      _lastSel = { text: '', rect: null };
      return;
    }

    // Always remember the selection (needed for context menu path)
    try {
      const range = sel.getRangeAt(0);
      _lastSel = { text, rect: range.getBoundingClientRect() };
    } catch { _lastSel = { text, rect: null }; }

    // Only show floating bar if user opted in
    if (_trigger === 'selectionbar') showSelectionBar(text, _lastSel.rect);
  });

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest?.('.captain-selection-bar') && !e.target.closest?.('.captain-note-popup')) {
      removeSelectionBar();
    }
  });

  // ── Context menu integration ──────────────────────────────────────────────
  // Listens for a message from the background's context menu handler
  // (registered in background.js via chrome.contextMenus).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'annotate:context-highlight') {
      // Use the stored selection text; context menu fires after mouseup so it's fresh
      const { text, color = '#ffff0066' } = msg;
      const useText = text || _lastSel.text;
      if (useText) addAnnotation(useText, '', color);
    }
    if (msg.type === 'annotate:context-note') {
      const useText = msg.text || _lastSel.text;
      if (!useText) return;
      const note = prompt('Add a note:', '') || '';
      addAnnotation(useText, note, '#ffff0066');
    }
  });

  // ── Floating selection bar (opt-in) ───────────────────────────────────────
  function showSelectionBar(text, rect) {
    removeSelectionBar();
    if (!rect) return;

    _selectionBar = document.createElement('div');
    _selectionBar.className = 'captain-selection-bar';
    _selectionBar.style.cssText = `
      position:fixed;z-index:2147483646;
      background:oklch(11% 0.003 260 / 0.95);
      border:1px solid oklch(60% 0.16 220 / 0.6);
      border-radius:6px;padding:4px 6px;display:flex;gap:6px;
      box-shadow:0 4px 16px oklch(0% 0 0 / 0.35);
      backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
    `;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - 80, 8), window.innerWidth - 170);
    _selectionBar.style.left = `${left}px`;
    _selectionBar.style.top  = `${Math.max(rect.top - 44, 4)}px`;

    const colors = ['#ffff0066','#ff990066','#00ff9966','#3b7dd866'];
    colors.forEach(c => {
      const b = document.createElement('button');
      b.style.cssText = `width:18px;height:18px;border-radius:50%;background:${c};border:2px solid oklch(0% 0 0 / 0.15);cursor:pointer;padding:0;flex-shrink:0;`;
      b.title = 'Highlight';
      b.addEventListener('mousedown', ev => ev.preventDefault());
      b.addEventListener('click', () => addAnnotation(text, '', c));
      _selectionBar.appendChild(b);
    });

    const noteBtn = document.createElement('button');
    noteBtn.textContent = '✏';
    noteBtn.title = 'Highlight + note';
    noteBtn.style.cssText = `background:none;border:none;cursor:pointer;font-size:13px;padding:0 3px;color:oklch(80% 0.008 260);`;
    noteBtn.addEventListener('mousedown', ev => ev.preventDefault());
    noteBtn.addEventListener('click', async () => {
      const note = prompt('Add a note (optional):') || '';
      await addAnnotation(text, note, '#ffff0066');
    });
    _selectionBar.appendChild(noteBtn);
    document.body.appendChild(_selectionBar);
  }

  function removeSelectionBar() { _selectionBar?.remove(); _selectionBar = null; }

  async function addAnnotation(selectedText, note, color) {
    removeSelectionBar();
    window.getSelection()?.removeAllRanges();
    const res = await safeSend({ type: 'annotate:add', url: location.href, selectedText, note, color });
    if (res?.ok) {
      _annotations.push(res.annotation);
      renderHighlights();
    }
  }

  // ── Listen for messages from background ───────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'annotate:render') loadAnnotations();
    if (msg.type === 'annotate:export-trigger') {
      safeSend({ type: 'annotate:export', url: location.href, options: msg.options });
    }
  });

  // ── Inject minimal styles ─────────────────────────────────────────────────
  if (!document.getElementById('captain-annotate-styles')) {
    const style = document.createElement('style');
    style.id = 'captain-annotate-styles';
    style.textContent = `.captain-highlight{border-radius:2px;transition:filter .15s}.captain-highlight:hover{filter:brightness(.85)}`;
    (document.head || document.documentElement).appendChild(style);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  loadAnnotations();

})();
