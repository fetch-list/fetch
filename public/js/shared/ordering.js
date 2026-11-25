// Sort profiles (see docs/decisions/0008): a profile ranks item names with fractional positions.
import { normName } from './model.js';

// Sort positions belong to (profile, item name), not to an item instance,
// so a shop layout survives items being deleted and added again.
export const rankId = (profileId, name) => profileId + '|' + normName(name);

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
