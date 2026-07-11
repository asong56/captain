'use strict';

// ── Action dispatcher ─────────────────────────────────────────────────────────
// All palette actions flow through here. Six clean cases:
//   1. search query           → browser:search
//   2. goto/url               → browser:goto  (normalizes bare domains)
//   3. tab switch             → browser:do-action (actionType:tab)
//   4. bookmark / history     → browser:goto
//   5. ua:set:<encoded>       → ua:set
//   6. act:* / sc:*           → browser:do-action  ← was missing; caused all browser actions to silently fail
//   7. everything else        → type = action.id   (webrtc:, fg:, bl:, proxy:, ua:reset, …)
async function dispatchAction(action) {
  const id  = action.id || '';
  let   msg;

  if (id === 'browser:search' || action.action === 'search') {
    msg = { type: 'browser:search', query: action.query };

  } else if (id === 'browser:goto' || action.action === 'goto') {
    let url = action.query || action.url || '';
    if (url && !/^[\w-]+:\/\//i.test(url)) url = 'https://' + url;
    msg = { type: 'browser:goto', url };

  } else if (action.type === 'tab') {
    msg = { type: 'browser:do-action', actionType: 'tab',
            tabId: action.tabId, tabIndex: action.tabIndex, windowId: action.windowId };

  } else if (action.type === 'bookmark' || action.type === 'history') {
    msg = { type: 'browser:goto', url: action.url };

  } else if (id.startsWith('ua:set:')) {
    msg = { type: 'ua:set', ua: decodeURIComponent(id.slice(7)), mode: 'global' };

  } else if (id.startsWith('act:') || id.startsWith('sc:')) {
    msg = { type: 'browser:do-action', id, url: action.url };

  } else {
    msg = { type: id, ...action };
  }

  await chrome.runtime.sendMessage(msg).catch(() => {});
}

// ── Overlay frame ─────────────────────────────────────────────────────────────
let frame = null;
let open  = false;

function ensureFrame() {
  if (frame) return;
  frame = document.createElement('iframe');
  frame.id  = 'nexus-overlay-frame';
  frame.src = chrome.runtime.getURL('content/overlay-inner.html');
  frame.setAttribute('allow', '');
  document.documentElement.appendChild(frame);
  window.addEventListener('message', onFrameMsg);
}

function show() { if (!open) { ensureFrame(); frame.style.display = 'block'; open = true; frame.contentWindow?.postMessage({ type: 'nexus:show' }, '*'); } }
function hide() { if (open)  { open = false; frame.style.display = 'none'; } }

function onFrameMsg(e) {
  const { type } = e.data || {};
  if (!type?.startsWith('nexus:')) return;
  if (type === 'nexus:close')  { hide(); return; }
  if (type === 'nexus:action') { hide(); dispatchAction(e.data.action); return; }
  if (type === 'nexus:query')  { relay(e.data.query); return; }
  if (type === 'nexus:remove') { chrome.runtime.sendMessage({ type: 'browser:remove', ...e.data }).catch(() => {}); return; }
}

async function relay(query) {
  const res = await chrome.runtime.sendMessage({ type: 'browser:get-actions', query }).catch(() => ({}));
  frame?.contentWindow?.postMessage({ type: 'nexus:results', actions: res?.actions || [] }, '*');
}

// ── External triggers ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'nexus:open')  show();
  if (msg.type === 'nexus:close') hide();
});

document.addEventListener('keydown', e => {
  const mac = /mac/i.test(navigator.userAgentData?.platform || navigator.userAgent);
  if ((mac ? e.metaKey : e.ctrlKey) && e.shiftKey && e.key === 'K') { e.preventDefault(); open ? hide() : show(); }
  if (e.key === 'Escape' && open) { e.preventDefault(); hide(); }
}, true);

ensureFrame();
