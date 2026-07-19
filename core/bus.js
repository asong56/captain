// core/bus.js — Internal service bus
// All modules communicate through here. No direct cross-module calls.
// This means refactoring one module doesn't break others.

const _services = new Map();
const _listeners = new Map();

export function expose(namespace, api) {
  _services.set(namespace, api);
}

export function call(namespace, method, ...args) {
  const svc = _services.get(namespace);
  if (!svc || typeof svc[method] !== 'function')
    throw new Error(`Captain bus: ${namespace}.${method} not found`);
  return svc[method](...args);
}

export async function callSafe(namespace, method, ...args) {
  try { return { ok: true, value: await call(namespace, method, ...args) }; }
  catch (e) { return { ok: false, error: String(e) }; }
}

export function on(event, fn) {
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event).add(fn);
}

export function off(event, fn) {
  _listeners.get(event)?.delete(fn);
}

export function emit(event, data) {
  for (const fn of (_listeners.get(event) ?? [])) {
    try { fn(data); } catch (e) { console.warn('[Bus]', event, e); }
  }
}
