// Turns registers into the plain objects the UI and the API work with.

export const normName = (name) => name.trim().toLowerCase();

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
