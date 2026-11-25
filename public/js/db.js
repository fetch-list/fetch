// Thin promise wrapper around IndexedDB.
// reg:    last-writer-wins registers, key [list, entity, id, field]
// outbox: local writes the server has not confirmed yet
// kv:     device-local settings (node id, clock, known lists, active profiles)

let db;

const req = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export async function open() {
  const r = indexedDB.open('fetch', 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore('reg', { keyPath: ['list', 'entity', 'id', 'field'] });
    r.result.createObjectStore('outbox', { autoIncrement: true });
    r.result.createObjectStore('kv');
  };
  db = await req(r);
}

// Run fn(store, ...) in one transaction; resolves with fn's result once the transaction has committed.
export function tx(stores, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const out = fn(...stores.map((s) => t.objectStore(s)));
    t.oncomplete = () => resolve(out);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

export const all = (store) => tx([store], 'readonly', (s) => req(s.getAll()));
export const get = (key) => tx(['kv'], 'readonly', (s) => req(s.get(key)));
export const set = (key, value) => tx(['kv'], 'readwrite', (s) => void s.put(value, key));

export const outbox = () =>
  tx(['outbox'], 'readonly', (s) => Promise.all([req(s.getAllKeys()), req(s.getAll())]));
