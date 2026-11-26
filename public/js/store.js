// What the user can do with lists, as writes to the local replica. The UI only talks to this module.
import * as replica from './replica.js';
import { state, registersOf } from './replica.js';
import * as sync from './sync.js';
import { uuid, UUID_RE } from './uuid.js';
import { itemId, materialize } from './shared/model.js';
import { rankWrites, sortItems } from './shared/ordering.js';

export { state };
export const onChange = replica.onChange;

export async function init() {
  await replica.open();
  const shared = location.hash.slice(1);
  if (UUID_RE.test(shared)) await join(shared);
  else if (!state.lists.length) await createList('Einkaufsliste');
  else await select(state.lists.some((l) => l.id === state.current) ? state.current : state.lists[0].id);
  sync.start();
}

// ---- reading ----

export const listName = (id) => registersOf(id).get(`list\n${id}\nname`)?.value || 'Unbenannte Liste';

export function view() {
  const list = materialize(registersOf(state.current).values());
  const chosen = state.profiles[state.current];
  const profile = list.profiles.some((p) => p.id === chosen) ? chosen : null;
  return {
    ...list,
    profile,
    active: sortItems(list.items.filter((i) => !i.deleted), list.ranks, profile),
    history: list.items.filter((i) => i.deleted).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
  };
}

// ---- writing ----

async function write(listId, writes) {
  await replica.write(listId, writes);
  sync.sync();
}

const here = (writes) => write(state.current, writes);

export function addItem(name, qty = 1) {
  name = name.trim();
  if (!name) return;
  const id = itemId(name);
  const existing = materialize(registersOf(state.current).values()).items.find((i) => i.id === id);
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
  await replica.save('profiles');
  replica.emit();
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

export async function select(id) {
  state.current = id;
  await replica.save('current');
  history.replaceState(null, '', '#' + id);
  sync.watch(id);
  replica.emit();
  sync.sync();
}

export async function createList(name) {
  const id = uuid();
  state.lists.push({ id, since: 0 });
  await replica.save('lists');
  await write(id, [['list', id, 'name', name]]);
  await select(id);
}

export async function join(id) {
  if (!state.lists.some((l) => l.id === id)) {
    state.lists.push({ id, since: 0 });
    await replica.save('lists');
  }
  await select(id);
}

export const renameList = (name) => here([['list', state.current, 'name', name]]);

// Removes the list from this device only; it stays on the server for everyone else.
export async function forgetList() {
  const id = state.current;
  state.lists = state.lists.filter((l) => l.id !== id);
  await replica.save('lists');
  if (state.lists.length) await select(state.lists[0].id);
  else await createList('Einkaufsliste');
}
