// core/storage.js — Namespaced chrome.storage.local helpers

export const get    = async (key) => { const r = await chrome.storage.local.get(key); return r[key]; };
export const set    = (key, val)  => chrome.storage.local.set({ [key]: val });
export const update = async (key, patch) => { const cur = (await get(key)) ?? {}; return set(key, { ...cur, ...patch }); };
export const remove = (key) => chrome.storage.local.remove(key);
export const getAll = async (keys) => chrome.storage.local.get(keys);
