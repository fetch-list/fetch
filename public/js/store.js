// Local-first store: every write goes to memory + IndexedDB first, the server hears about it later.
import * as db from './db.js';
import { Clock } from './shared/hlc.js';
import { merge } from './shared/registers.js';
import { itemId, materialize } from './shared/model.js';
import { rankWrites, sortItems } from './shared/ordering.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// crypto.randomUUID() only exists in secure contexts; this also works over plain http in a LAN.
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const state = {
  lists: [], // [{ id, since }] known on this device
  current: null,
  profiles: {}, // listId -> active sort profile on this device
  pending: 0, // writes not yet confirmed by the server
  online: navigator.onLine,
  syncing: false,
};

const regs = new Map(); // listId -> Map<registerKey, register>
const listeners = new Set();
const tabs = new BroadcastChannel('fetch');
let clock;
let events;

const regsOf = (listId) => regs.get(listId) ?? regs.set(listId, new Map()).get(listId);
const emit = () => listeners.forEach((fn) => fn());
export const onChange = (fn) => listeners.add(fn);

async function loadRegs() {
  regs.clear();
  for (const { list, ...r } of await db.all('reg')) merge(regsOf(list), r);
  state.pending = (await db.outbox())[0].length;
}

export async function init() {
  await db.open();
  navigator.storage?.persist?.(); // ask the browser not to evict our data
  let node = await db.get('node');
  if (!node) await db.set('node', (node = uuid().slice(0, 8)));
  clock = new Clock(node, (await db.get('clock')) ?? '');
  state.lists = (await db.get('lists')) ?? [];
  state.profiles = (await db.get('profiles')) ?? {};
  state.current = (await db.get('current')) ?? null;
  await loadRegs();

  const shared = location.hash.slice(1);
  if (UUID_RE.test(shared)) await join(shared);
  else if (!state.lists.length) await createList('Einkaufsliste');
  else await select(state.lists.some((l) => l.id === state.current) ? state.current : state.lists[0].id);

  tabs.onmessage = async () => {
    await loadRegs();
    emit();
  };
  addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync());
  setInterval(sync, 30_000);
}

// ---- reading ----

export const listName = (id) => regsOf(id).get(`list\n${id}\nname`)?.value || 'Unbenannte Liste';

export function view() {
  const list = materialize(regsOf(state.current).values());
  const profile = list.profiles.some((p) => p.id === state.profiles[state.current])
    ? state.profiles[state.current]
    : null;
  return {
    ...list,
    profile,
    active: sortItems(list.items.filter((i) => !i.deleted), list.ranks, profile),
    history: list.items.filter((i) => i.deleted).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
  };
}

// ---- writing ----

// writes: [[entity, id, field, value], ...]
async function write(listId, writes) {
  const stamped = writes.map(([entity, id, field, value]) => ({ entity, id, field, value, hlc: clock.now() }));
  for (const r of stamped) merge(regsOf(listId), r);
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
  tabs.postMessage('changed');
  sync();
}

const here = (writes) => write(state.current, writes);

export function addItem(name, qty = 1) {
  name = name.trim();
  if (!name) return;
  const id = itemId(name);
  const existing = materialize(regsOf(state.current).values()).items.find((i) => i.id === id);
  // "deleted: false" is written even if the item looks active here: someone else may have removed
  // it while we were offline, and the write has to state the full intent ("this belongs on the list")
  // to win that conflict.
  const writes = [['item', id, 'qty', qty], ['item', id, 'checked', false], ['item', id, 'deleted', false]];
  if (!existing) writes.push(['item', id, 'name', name]);
  if (!existing || existing.deleted) writes.push(['item', id, 'added', Date.now()]);
  return here(writes);
}

export const setItem = (id, field, value) => here([['item', id, field, value]]);
export const removeItems = (ids) =>
  here(ids.flatMap((id) => [['item', id, 'deleted', true], ['item', id, 'deletedAt', Date.now()]]));
export const restoreItem = (item) => addItem(item.name, item.qty ?? 1);

export async function createProfile(name) {
  const id = uuid();
  await here([['profile', id, 'name', name]]);
  await setProfile(id);
  return id;
}

export async function setProfile(id) {
  state.profiles[state.current] = id;
  await db.set('profiles', state.profiles);
  emit();
}

// Called after drag and drop with the item ids in their new order.
export async function reorder(orderedIds, movedId) {
  const v = view();
  const profile = v.profile ?? (await createProfile('Mein Markt'));
  const byId = new Map(v.active.map((i) => [i.id, i]));
  const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  await here(rankWrites(ordered, movedId, v.ranks, profile).map(([id, pos]) => ['rank', id, 'pos', pos]));
}

export const saveBundle = (name, items) => {
  const id = uuid();
  return here([['bundle', id, 'name', name], ['bundle', id, 'items', items.map((i) => ({ name: i.name, qty: i.qty ?? 1 }))]]);
};
export const removeBundle = (id) => here([['bundle', id, 'deleted', true]]);
export async function addBundle(bundle) {
  for (const i of bundle.items ?? []) await addItem(i.name, i.qty);
}

// ---- lists ----

async function saveLists() {
  await db.set('lists', state.lists);
}

export async function select(id) {
  state.current = id;
  await db.set('current', id);
  history.replaceState(null, '', '#' + id);
  events?.close();
  // The server pings this stream whenever someone changes the list.
  events = new EventSource(`/api/lists/${id}/events`);
  events.onmessage = sync;
  emit();
  sync();
}

export async function createList(name) {
  const id = uuid();
  state.lists.push({ id, since: 0 });
  await saveLists();
  await write(id, [['list', id, 'name', name]]);
  await select(id);
}

export async function join(id) {
  if (!state.lists.some((l) => l.id === id)) {
    state.lists.push({ id, since: 0 });
    await saveLists();
  }
  await select(id);
}

export const renameList = (name) => here([['list', state.current, 'name', name]]);

// Removes the list from this device only; it stays on the server for everyone else.
export async function forgetList() {
  const id = state.current;
  state.lists = state.lists.filter((l) => l.id !== id);
  await saveLists();
  if (state.lists.length) await select(state.lists[0].id);
  else await createList('Einkaufsliste');
}

// ---- sync ----

let again = false;

export async function sync() {
  if (state.syncing) return void (again = true);
  state.syncing = true;
  emit();
  try {
    // 1. Push everything in the outbox, grouped by list.
    const [keys, entries] = await db.outbox();
    const byList = new Map();
    entries.forEach(({ list, ...change }, n) => {
      const g = byList.get(list) ?? byList.set(list, { keys: [], changes: [] }).get(list);
      g.keys.push(keys[n]);
      g.changes.push(change);
    });
    for (const [list, g] of byList) {
      const res = await fetch(`/api/lists/${list}/changes`, { method: 'POST', body: JSON.stringify({ changes: g.changes }) });
      if (!res.ok) throw new Error('push failed: ' + res.status);
      await db.tx(['outbox'], 'readwrite', (s) => g.keys.forEach((k) => s.delete(k)));
      state.pending = Math.max(0, state.pending - g.keys.length);
    }
    // 2. Pull what changed on the server since our cursor.
    for (const l of state.lists) {
      const res = await fetch(`/api/lists/${l.id}/changes?since=${l.since}`);
      if (!res.ok) throw new Error('pull failed: ' + res.status);
      const { seq, changes } = await res.json();
      const won = changes.filter((c) => {
        clock.observe(c.hlc);
        return merge(regsOf(l.id), c);
      });
      l.since = seq;
      await db.tx(['reg', 'kv'], 'readwrite', (reg, kv) => {
        for (const c of won) reg.put({ list: l.id, ...c });
        kv.put(state.lists, 'lists');
        kv.put(clock.toString(), 'clock');
      });
      if (won.length) tabs.postMessage('changed');
    }
    state.online = true;
  } catch {
    state.online = false; // stay usable; the outbox keeps the changes until the next attempt
  }
  state.syncing = false;
  emit();
  if (again) {
    again = false;
    sync();
  }
}
