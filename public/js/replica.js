// The local replica: registers of every known list in memory and in IndexedDB,
// plus the outbox of writes the server has not confirmed yet (docs/decisions/0005, 0006).
// Every write lands here first, so the app works the same with and without a connection.
import * as db from './db.js';
import { uuid } from './uuid.js';
import { Clock } from './shared/hlc.js';
import { merge } from './shared/registers.js';

// Device state that the UI reads. Only the replica and the sync module change it.
export const state = {
  lists: [], // [{ id, since }] lists known on this device, `since` is the pull cursor
  current: null, // id of the list on screen
  profiles: {}, // listId -> sort profile chosen on this device
  pending: 0, // writes not yet confirmed by the server
  online: navigator.onLine,
  syncing: false,
};

const registers = new Map(); // listId -> Map<registerKey, register>
const listeners = new Set();
const otherTabs = new BroadcastChannel('fetch');
let clock;

export const registersOf = (listId) => registers.get(listId) ?? registers.set(listId, new Map()).get(listId);
export const onChange = (fn) => listeners.add(fn);
export const emit = () => listeners.forEach((fn) => fn());

async function loadRegisters() {
  registers.clear();
  for (const { list, ...r } of await db.all('reg')) merge(registersOf(list), r);
  state.pending = (await db.outbox())[0].length;
}

export async function open() {
  await db.open();
  navigator.storage?.persist?.(); // ask the browser not to evict our data under storage pressure
  let node = await db.get('node');
  if (!node) await db.set('node', (node = uuid().slice(0, 8)));
  clock = new Clock(node, (await db.get('clock')) ?? '');
  state.lists = (await db.get('lists')) ?? [];
  state.profiles = (await db.get('profiles')) ?? {};
  state.current = (await db.get('current')) ?? null;
  await loadRegisters();
  // Another tab wrote to IndexedDB: reload from there.
  otherTabs.onmessage = async () => {
    await loadRegisters();
    emit();
  };
}

// Saves device state (lists, current, profiles) under its key.
export const save = (key) => db.set(key, state[key]);

// Local write. writes: [[entity, id, field, value], ...]
export async function write(listId, writes) {
  const stamped = writes.map(([entity, id, field, value]) => ({ entity, id, field, value, hlc: clock.now() }));
  for (const r of stamped) merge(registersOf(listId), r);
  state.pending += stamped.length;
  emit();
  // Register and outbox entry are stored in one transaction, so a crash cannot lose a pending change.
  await db.tx(['reg', 'outbox', 'kv'], 'readwrite', (reg, outbox, kv) => {
    for (const r of stamped) {
      reg.put({ list: listId, ...r });
      outbox.add({ list: listId, ...r });
    }
    kv.put(clock.toString(), 'clock');
  });
  otherTabs.postMessage('changed');
}

// Unsent writes grouped by list: Map<listId, { keys, changes }>.
export async function outbox() {
  const [keys, entries] = await db.outbox();
  const byList = new Map();
  entries.forEach(({ list, ...change }, n) => {
    const group = byList.get(list) ?? byList.set(list, { keys: [], changes: [] }).get(list);
    group.keys.push(keys[n]);
    group.changes.push(change);
  });
  return byList;
}

// The server has stored these outbox entries.
export async function confirm(keys) {
  await db.tx(['outbox'], 'readwrite', (s) => keys.forEach((k) => s.delete(k)));
  state.pending = Math.max(0, state.pending - keys.length);
}

// Merges changes pulled from the server and stores the new cursor in the same transaction.
export async function applyRemote(list, changes, seq) {
  const won = changes.filter((c) => {
    clock.observe(c.hlc);
    return merge(registersOf(list.id), c);
  });
  list.since = seq;
  await db.tx(['reg', 'kv'], 'readwrite', (reg, kv) => {
    for (const c of won) reg.put({ list: list.id, ...c });
    kv.put(state.lists, 'lists');
    kv.put(clock.toString(), 'clock');
  });
  if (won.length) otherTabs.postMessage('changed');
}
