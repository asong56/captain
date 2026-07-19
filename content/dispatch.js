// content/dispatch.js — shared action dispatcher
// ES module imported by overlay.js (content script) and newtab.js.

export async function dispatchAction(action) {
  const id = action.id || '';
  let msg;

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
