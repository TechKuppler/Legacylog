// Module-level singleton — persists across Next.js client-side route changes.
// Tracks in-flight background uploads so any component can show a status banner.

let _pending = 0; // count of active uploads
const _subs = new Set();

function notify() {
  _subs.forEach((fn) => fn(_pending));
}

export function startUpload(promise) {
  _pending++;
  notify();
  promise.finally(() => {
    _pending = Math.max(0, _pending - 1);
    notify();
  });
}

export function subscribe(fn) {
  _subs.add(fn);
  return () => _subs.delete(fn);
}

export function getPendingCount() {
  return _pending;
}
