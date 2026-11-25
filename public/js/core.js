// Sync core shared by browser and server (see docs/decisions/0006).
// State is a set of last-writer-wins registers keyed by (entity, id, field).
// Each write carries a hybrid logical clock (HLC) timestamp; the larger one wins.

export const ENTITIES = new Set(['list', 'item', 'profile', 'rank', 'bundle']);

// HLC string: <ms base36, 9 chars>:<counter base36, 4 chars>:<node id>.
// Fixed widths make plain string comparison equal to (ms, counter, node) ordering.
export const HLC_RE = /^[0-9a-z]{9}:[0-9a-z]{4}:[\w-]{1,40}$/;

const pack = (ms, counter, node) =>
  ms.toString(36).padStart(9, '0') + ':' + counter.toString(36).padStart(4, '0') + ':' + node;

export class Clock {
  constructor(node, last = '') {
    this.node = node;
    this.ms = 0;
    this.counter = 0;
    if (last) this.observe(last);
  }

  // Timestamp for a local write. Never goes backwards, even if the wall clock does.
  now(wall = Date.now()) {
    if (wall > this.ms) {
      this.ms = wall;
      this.counter = 0;
    } else {
      this.counter++;
    }
    return pack(this.ms, this.counter, this.node);
  }

  // Advance past a timestamp seen from another replica.
  observe(hlc) {
    const ms = parseInt(hlc.slice(0, 9), 36);
    const counter = parseInt(hlc.slice(10, 14), 36);
    if (ms > this.ms || (ms === this.ms && counter > this.counter)) {
      this.ms = ms;
      this.counter = counter;
    }
  }

  toString() {
    return pack(this.ms, this.counter, this.node);
  }
}

export const regKey = (r) => r.entity + '\n' + r.id + '\n' + r.field;

// The whole conflict rule: an incoming write wins if it is newer than what we have.
export const wins = (incoming, existing) => !existing || incoming.hlc > existing.hlc;

// Merge one register into a Map<regKey, register>. Returns true if state changed.
export function merge(regs, incoming) {
  const key = regKey(incoming);
  if (!wins(incoming, regs.get(key))) return false;
  regs.set(key, incoming);
  return true;
}

export const normName = (name) => name.trim().toLowerCase();

// Sort positions belong to (profile, item name), not to an item instance,
// so a store layout survives items being deleted and added again.
export const rankId = (profileId, name) => profileId + '|' + normName(name);

// Fold registers into plain objects.
export function materialize(regs) {
  const ent = {};
  for (const r of regs) {
    const byId = (ent[r.entity] ??= new Map());
    let obj = byId.get(r.id);
    if (!obj) byId.set(r.id, (obj = { id: r.id }));
    obj[r.field] = r.value;
  }
  const all = (entity) => [...(ent[entity]?.values() ?? [])];
  return {
    name: all('list')[0]?.name ?? '',
    items: all('item').filter((i) => typeof i.name === 'string' && i.name),
    profiles: all('profile').filter((p) => p.name && !p.deleted),
    bundles: all('bundle').filter((b) => b.name && !b.deleted),
    ranks: new Map(all('rank').map((r) => [r.id, r.pos])),
  };
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Ranked items first (by position in the profile), then the rest in the order they were added.
export function sortItems(items, ranks, profileId) {
  const pos = (i) => (profileId ? ranks.get(rankId(profileId, i.name)) : undefined);
  return [...items].sort((a, b) => {
    const pa = pos(a);
    const pb = pos(b);
    if (pa != null && pb != null) return pa - pb || byId(a, b);
    if (pa != null) return -1;
    if (pb != null) return 1;
    return (a.added ?? 0) - (b.added ?? 0) || byId(a, b);
  });
}

// Rank writes needed after dragging `movedId` to its place in `ordered` (items in new display order).
// Returns [[rankId, pos], ...]. Usually one write; more only if unranked items sit above the drop point.
export function rankWrites(ordered, movedId, ranks, profileId) {
  const writes = [];
  const idx = ordered.findIndex((i) => i.id === movedId);
  const posOf = (i) => ranks.get(rankId(profileId, i.name));
  let prev = 0;
  for (let k = 0; k < idx; k++) {
    let p = posOf(ordered[k]);
    if (p == null || p <= prev) {
      p = prev + 1;
      writes.push([rankId(profileId, ordered[k].name), p]);
    }
    prev = p;
  }
  const after = ordered[idx + 1] && posOf(ordered[idx + 1]);
  const pos = after != null && after > prev ? (prev + after) / 2 : prev + 1;
  writes.push([rankId(profileId, ordered[idx].name), pos]);
  return writes;
}
