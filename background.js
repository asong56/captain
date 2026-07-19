// background.js — Captain unified service worker

import { init as initBrowser,   handlers as browserHandlers   } from './providers/browser.js';
import { init as initWebRTC,    handlers as webrtcHandlers    } from './providers/webrtc.js';
import { init as initUA,        handlers as uaHandlers        } from './providers/ua.js';
import { init as initBL,        handlers as blHandlers        } from './providers/blacklist.js';
import { init as initFG,        handlers as fgHandlers        } from './providers/focus-guard.js';
import { init as initProxy,     handlers as proxyHandlers,
         handleProxyAction                                     } from './providers/proxy.js';
import { init as initVault,     handlers as vaultHandlers     } from './providers/vault.js';
import { init as initDiscard,   handlers as discardHandlers   } from './providers/tab-discard.js';
import { init as initWorkspace, handlers as workspaceHandlers,
         handleWorkspaceAction                                 } from './providers/workspace.js';
import { init as initAnnotate,  handlers as annotateHandlers  } from './providers/annotate.js';
import { init as initAI,        handlers as aiHandlers,
         streamChat                                        } from './providers/ai.js';
import { get, set }  from './core/storage.js';

// ── Migration: move old captain keys to captain keys ─────────────────────────────
async function migrate() {
  const done = await get('c.migrated.v1');
  if (done) return;
  const old = await chrome.storage.local.get(null);
  const mapping = {
    'p.proxy.profiles': 'c.proxy.profiles',
    'p.proxy.active':   'c.proxy.active',
    'p.ua.active':      'c.ua.active',
    'p.ua.custom':      'c.ua.custom',
    'p.webrtc':         'c.webrtc',
    'p.bl.rules':       'c.bl.rules',
  };
  const patch = {};
  for (const [from, to] of Object.entries(mapping)) {
    if (old[from] !== undefined && old[to] === undefined) patch[to] = old[from];
  }
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  await set('c.migrated.v1', true);
}

(async () => {
  await migrate();

  await Promise.all([
    initBrowser(),
    initWebRTC(),
    initUA(),
    initBL(),
    initFG(),
    initProxy(),
    initVault(),
    initDiscard(),
    initWorkspace(),
    initAnnotate(),
    initAI(),
  ]);

  const allHandlers = {
    ...browserHandlers,
    ...webrtcHandlers,
    ...uaHandlers,
    ...blHandlers,
    ...fgHandlers,
    ...proxyHandlers,
    ...vaultHandlers,
    ...discardHandlers,
    ...workspaceHandlers,
    ...annotateHandlers,
    ...aiHandlers,
  };

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg?.type) return;

    const dynamicHandler =
      handleProxyAction(msg.type) ??
      handleWorkspaceAction(msg.type) ??
      handleVaultFill(msg.type);

    const handler = dynamicHandler ?? allHandlers[msg.type];
    if (!handler) return;

    handler(msg, sender)
      .then(respond)
      .catch(err => {
        console.error('[Captain] Handler error for', msg.type, err);
        respond({ ok: false, error: String(err) });
      });

    return true;
  });

  // AI streaming via long-lived port
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'captain-ai-stream') return;
    port.onMessage.addListener(async (msg) => {
      if (msg.type !== 'ai:stream') return;
      const { messages } = msg;
      try {
        const config = await get('c.ai.config').then(v => v || {});
        for await (const chunk of streamChat(messages, config)) {
          try { port.postMessage({ type: 'chunk', content: chunk }); } catch { break; }
        }
        port.postMessage({ type: 'done' });
      } catch (e) {
        try { port.postMessage({ type: 'error', error: String(e) }); } catch {}
      }
    });
  });

  // ── Context menus for annotation (right-click trigger) ───────────────────
  // Only register if contextMenus permission is available
  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'captain-annotate-parent',
        title: 'Captain — Annotate',
        contexts: ['selection'],
      });
      chrome.contextMenus.create({
        id: 'captain-annotate-highlight',
        parentId: 'captain-annotate-parent',
        title: 'Highlight selection',
        contexts: ['selection'],
      });
      chrome.contextMenus.create({
        id: 'captain-annotate-note',
        parentId: 'captain-annotate-parent',
        title: 'Highlight + add note',
        contexts: ['selection'],
      });
    });

    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
      if (!tab?.id) return;
      const text = info.selectionText || '';
      if (info.menuItemId === 'captain-annotate-highlight') {
        chrome.tabs.sendMessage(tab.id, { type: 'annotate:context-highlight', text }).catch(() => {});
      }
      if (info.menuItemId === 'captain-annotate-note') {
        chrome.tabs.sendMessage(tab.id, { type: 'annotate:context-note', text }).catch(() => {});
      }
    });
  }

  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'open-captain') await browserHandlers['browser:open-captain']?.();
  });

  chrome.action.onClicked.addListener(async () => {
    await browserHandlers['browser:open-captain']?.();
  });
})();

function handleVaultFill(type) {
  if (!type?.startsWith('vault:fill:')) return null;
  const uuid = type.slice('vault:fill:'.length);
  return () => vaultHandlers['vault:fill']({ uuid });
}
