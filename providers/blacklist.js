// providers/blacklist.js
// Reimplemented from uBlacklist-9.9.0 (Google-only, cloud sync removed)
// Rule formats: domain.com | *.wildcard.com | /regex/i
// Storage key: 'p.bl.rules' → string (one rule per line)

import { register } from '../core/registry.js';
import { get, set } from '../core/storage.js';

const RULES_KEY = 'p.bl.rules';

// ── Rule parsing ──────────────────────────────────────────────────────────────
function parseRules(text) {
  if (!text) return [];
  return text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

function ruleToMatcher(rule) {
  const reParts = rule.match(/^\/(.+)\/([gimsuy]*)$/);
  if (reParts) {
    try { return new RegExp(reParts[1], reParts[2]); } catch { return null; }
  }
  if (rule.startsWith('*.')) {
    const base = rule.slice(2).replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\.)${base}$`, 'i');
  }
  const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\.)${escaped}$`, 'i');
}

// Optimization 1: cache parsed matchers; invalidate when rules change
let _matcherCache = null;

function invalidateCache() { _matcherCache = null; }

async function getMatchers() {
  if (_matcherCache) return _matcherCache;
  const text   = await get(RULES_KEY);
  _matcherCache = parseRules(text || '').map(ruleToMatcher).filter(Boolean);
  return _matcherCache;
}

export async function isBlocked(hostname) {
  if (!hostname) return false;
  const matchers = await getMatchers();
  return matchers.some(m => m.test(hostname));
}

async function getRuleCount() {
  return parseRules((await get(RULES_KEY)) || '').length;
}

async function addRule(hostname) {
  const text     = (await get(RULES_KEY)) || '';
  const existing = parseRules(text);
  if (existing.includes(hostname)) return { ok: true, added: false };
  await set(RULES_KEY, [...existing, hostname].join('\n'));
  invalidateCache();
  return { ok: true, added: true };
}

function openOptions() {
  chrome.tabs.create({ url: chrome.runtime.getURL('pages/options.html#blacklist') });
}

// ── Provider init ─────────────────────────────────────────────────────────────
export async function init() {
  register('blacklist', async (q) => {
    const match = t => !q || t.toLowerCase().includes(q.toLowerCase());
    const count = await getRuleCount();
    const results = [];
    if (match('search filter settings'))
      results.push({ id: 'bl:open', title: 'Search Filter: Open settings',
        desc: `${count} rule${count !== 1 ? 's' : ''} active`, emoji: '🚫', type: 'action' });
    if (match('block site search'))
      results.push({ id: 'bl:add-current', title: 'Search Filter: Block current site',
        desc: 'Hide this domain from Google results', emoji: '🚫', type: 'action' });
    return results;
  });
}

export const handlers = {
  'bl:check': async (msg) => ({ blocked: await isBlocked(msg.hostname) }),
  'bl:add':   async (msg) => addRule(msg.hostname),
  'bl:add-current': async (_, sender) => {
    try {
      const tab = sender?.tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      return addRule(new URL(tab?.url || '').hostname);
    } catch { return { ok: false }; }
  },
  'bl:remove': async (msg) => {
    const text = (await get(RULES_KEY)) || '';
    await set(RULES_KEY, parseRules(text).filter(r => r !== msg.rule).join('\n'));
    invalidateCache();
    return { ok: true };
  },
  'bl:get-rules': async () => ({ ok: true, rules: (await get(RULES_KEY)) || '' }),
  'bl:set-rules': async (msg) => {
    await set(RULES_KEY, msg.rules || '');
    invalidateCache();
    return { ok: true };
  },
  'bl:open':         async () => { openOptions(); return { ok: true }; },
  'bl:open-options': async () => { openOptions(); return { ok: true }; },
};
