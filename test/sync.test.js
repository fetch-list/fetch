import test from 'node:test';
import assert from 'node:assert/strict';
import { Clock, merge, materialize, sortItems, rankWrites, rankId } from '../public/js/core.js';
import { createApp } from '../server/server.js';

const LIST = '11111111-1111-4111-8111-111111111111';
const op = (clock, entity, id, field, value, wall) => ({ entity, id, field, value, hlc: clock.now(wall) });

test('clock stays monotonic when the wall clock jumps back', () => {
  const c = new Clock('a');
  const t1 = c.now(2000);
  const t2 = c.now(1000);
  const t3 = c.now(1000);
  assert.ok(t1 < t2 && t2 < t3);
});

test('clock moves past observed remote timestamps', () => {
  const a = new Clock('a');
  const b = new Clock('b');
  const remote = b.now(5000);
  a.observe(remote);
  assert.ok(a.now(1000) > remote);
});

test('replicas converge regardless of delivery order', () => {
  const a = new Clock('a');
  const b = new Clock('b');
  const ops = [
    op(a, 'item', 'i1', 'name', 'Milch', 1000),
    op(a, 'item', 'i1', 'checked', false, 1001),
    op(b, 'item', 'i1', 'checked', true, 1500), // concurrent with the rename below
    op(a, 'item', 'i1', 'name', 'Hafermilch', 1600),
    op(b, 'item', 'i1', 'name', 'Vollmilch', 1550),
  ];
  const fold = (list) => {
    const regs = new Map();
    for (const o of list) merge(regs, o);
    return materialize(regs.values()).items[0];
  };
  const forward = fold(ops);
  const backward = fold([...ops].reverse());
  assert.deepEqual(forward, backward);
  assert.equal(forward.name, 'Hafermilch'); // latest write per field wins
  assert.equal(forward.checked, true); // edits to different fields both survive
});

test('drag and drop needs one rank write between ranked neighbours', () => {
  const items = ['Brot', 'Milch', 'Eier'].map((name, n) => ({ id: 'i' + n, name, added: n }));
  const p = 'p1';
  const ranks = new Map(items.map((i, n) => [rankId(p, i.name), n + 1]));
  // Move Eier between Brot and Milch.
  const writes = rankWrites([items[0], items[2], items[1]], 'i2', ranks, p);
  assert.deepEqual(writes, [[rankId(p, 'Eier'), 1.5]]);
  for (const [id, pos] of writes) ranks.set(id, pos);
  assert.deepEqual(sortItems(items, ranks, p).map((i) => i.name), ['Brot', 'Eier', 'Milch']);
});

test('dragging in an unranked list ranks everything above the drop point', () => {
  const items = ['Brot', 'Milch', 'Eier'].map((name, n) => ({ id: 'i' + n, name, added: n }));
  const ranks = new Map();
  for (const [id, pos] of rankWrites([items[0], items[2], items[1]], 'i2', ranks, 'p1')) ranks.set(id, pos);
  assert.deepEqual(sortItems(items, ranks, 'p1').map((i) => i.name), ['Brot', 'Eier', 'Milch']);
});

test('server: two offline clients sync and converge', async (t) => {
  const server = createApp().listen(0);
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}/api/lists/${LIST}`;
  const push = (changes) =>
    fetch(base + '/changes', { method: 'POST', body: JSON.stringify({ changes }) }).then((r) => r.json());
  const pull = (since) => fetch(`${base}/changes?since=${since}`).then((r) => r.json());

  const a = new Clock('a');
  const b = new Clock('b');
  await push([
    op(a, 'list', LIST, 'name', 'WG', 1000),
    op(a, 'item', 'i1', 'name', 'Quark', 1000),
    op(a, 'item', 'i1', 'qty', 1, 1000),
  ]);
  const cursor = (await pull(0)).seq;

  // Both go offline. B changes the quantity later than A does, but A's push arrives last.
  const offlineA = [op(a, 'item', 'i1', 'qty', 2, 2000), op(a, 'item', 'i1', 'checked', true, 2000)];
  const offlineB = [op(b, 'item', 'i1', 'qty', 3, 3000), op(b, 'item', 'i2', 'name', 'Eier', 3000)];
  assert.equal((await push(offlineB)).accepted, 2);
  assert.equal((await push(offlineA)).accepted, 1); // the stale qty write is dropped

  const state = await fetch(base).then((r) => r.json());
  const quark = state.items.find((i) => i.id === 'i1');
  assert.deepEqual([quark.qty, quark.checked], [3, true]);
  assert.equal(state.items.length, 2);

  // Incremental pull only returns what changed after the cursor.
  const delta = await pull(cursor);
  assert.deepEqual(delta.changes.map((c) => c.id + '.' + c.field).sort(), ['i1.checked', 'i1.qty', 'i2.name']);

  // Pushing the same changes again is a no-op.
  assert.equal((await push(offlineA)).accepted, 0);

  const csv = await fetch(base + '/export.csv').then((r) => r.text());
  assert.match(csv, /Quark,3,true,false/);
});

test('server: rejects malformed input', async (t) => {
  const server = createApp().listen(0);
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}/api/lists`;
  const post = (id, body) => fetch(`${base}/${id}/changes`, { method: 'POST', body }).then((r) => r.status);
  assert.equal(await post('not-a-uuid', '{"changes":[]}'), 400);
  assert.equal(await post(LIST, 'nope'), 400);
  assert.equal(await post(LIST, JSON.stringify({ changes: [{ entity: 'item', id: 'x', field: 'name', value: 'a', hlc: 'bad' }] })), 400);
  assert.equal((await fetch(`${base}/${LIST}`)).status, 404);
});
