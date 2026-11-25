// Turns registers into the plain objects the UI and the API work with.

export const normName = (name) => name.trim().toLowerCase();

// An item's id is its normalised name. Two devices that add "Milch" while offline therefore
// write the same registers, and the item appears once after sync instead of twice.
// The price: an item cannot be renamed, only removed and added under the new name.
export const itemId = (name) => normName(name);

// Folds registers into { name, items, profiles, bundles, ranks }.
export function materialize(registers) {
  const entities = {};
  for (const r of registers) {
    const byId = (entities[r.entity] ??= new Map());
    let obj = byId.get(r.id);
    if (!obj) byId.set(r.id, (obj = { id: r.id }));
    obj[r.field] = r.value;
  }
  const all = (entity) => [...(entities[entity]?.values() ?? [])];
  return {
    name: all('list')[0]?.name ?? '',
    items: all('item').filter((i) => typeof i.name === 'string' && i.name),
    profiles: all('profile').filter((p) => p.name && !p.deleted),
    bundles: all('bundle').filter((b) => b.name && !b.deleted),
    ranks: new Map(all('rank').map((r) => [r.id, r.pos])),
  };
}
