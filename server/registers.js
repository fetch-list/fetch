// Server side of the sync protocol (docs/decisions/0006): stores the winning write per register
// and hands out changes after a cursor.
import { ENTITIES } from '../public/js/shared/registers.js';
import { HLC_RE } from '../public/js/shared/hlc.js';

export function isValidChange(c) {
  return (
    c && ENTITIES.has(c.entity) &&
    typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 200 &&
    typeof c.field === 'string' && c.field.length > 0 && c.field.length <= 40 &&
    typeof c.hlc === 'string' && HLC_RE.test(c.hlc) &&
    c.value !== undefined && JSON.stringify(c.value).length <= 10_000
  );
}

export function createRegisterStore(db) {
  const maxSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM registers');
  // Last writer wins: an existing row is only replaced if the incoming timestamp is newer.
  const upsert = db.prepare(`
    INSERT INTO registers (list_id, entity, id, field, value, hlc, seq) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (list_id, entity, id, field) DO UPDATE
      SET value = excluded.value, hlc = excluded.hlc, seq = excluded.seq
      WHERE excluded.hlc > registers.hlc`);
  const since = db.prepare(
    'SELECT entity, id, field, value, hlc FROM registers WHERE list_id = ? AND seq > ? ORDER BY seq');

  // One counter for the whole database keeps cursors simple; it only has to grow.
  let seq = maxSeq.get().seq;
  const parse = (row) => ({ ...row, value: JSON.parse(row.value) });

  return {
    get seq() {
      return seq;
    },

    // Applies all changes in one transaction. Returns the number that won.
    apply(listId, changes) {
      let accepted = 0;
      db.exec('BEGIN');
      try {
        for (const c of changes) {
          const result = upsert.run(listId, c.entity, c.id, c.field, JSON.stringify(c.value), c.hlc, seq + 1);
          if (result.changes) {
            seq++;
            accepted++;
          }
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        seq = maxSeq.get().seq;
        throw err;
      }
      return accepted;
    },

    changesSince(listId, cursor) {
      return since.all(listId, cursor).map(parse);
    },
  };
}
