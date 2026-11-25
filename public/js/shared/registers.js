// Last-writer-wins registers (see docs/decisions/0006). All shared state is a set of registers
// keyed by (entity, id, field); each holds a value and the HLC timestamp of the write that set it.

export const ENTITIES = new Set(['list', 'item', 'profile', 'rank', 'bundle']);

export const registerKey = (r) => r.entity + '\n' + r.id + '\n' + r.field;

// The whole conflict rule: an incoming write wins if it is newer than what we have.
export const wins = (incoming, existing) => !existing || incoming.hlc > existing.hlc;

// Merges one register into a Map<registerKey, register>. Returns true if the state changed.
export function merge(registers, incoming) {
  const key = registerKey(incoming);
  if (!wins(incoming, registers.get(key))) return false;
  registers.set(key, incoming);
  return true;
}
