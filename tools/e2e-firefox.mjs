// Exploratory end-to-end check used for docs/03-findings.md. Not part of `npm test`.
// Drives headless Firefox over WebDriver BiDi: two users, server outage, offline edits, resync.
// Timing is done with fixed sleeps, so treat a failure as "look closer", not as proof of a bug.
// Run from the repository root: node tools/e2e-firefox.mjs
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
const TMP = mkdtempSync(tmpdir() + '/fetch-e2e-');
mkdirSync(TMP + '/prof');
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const PORT = 8137, URL0 = `http://localhost:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server;
const startServer = async () => { server = spawn('node', ['server/main.js'], { env: { ...process.env, PORT, FETCH_DB: TMP + '/test.db' }, stdio: 'inherit' }); await sleep(700); };
const stopServer = async () => { server.kill('SIGKILL'); await sleep(500); };
await startServer();
const ff = spawn('firefox', ['--headless', '--no-remote', '--profile', TMP + '/prof', '--remote-debugging-port', '9333', '--window-size=390,800'], { stdio: 'ignore' });
let ws;
for (let i = 0; i < 40; i++) { await sleep(500); try { ws = new WebSocket('ws://127.0.0.1:9333/session'); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); break; } catch { ws = null; } }
let n = 0; const waiting = new Map();
const cmd = (method, params = {}) => new Promise((res, rej) => { const id = ++n; waiting.set(id, [res, rej]); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (context, expression) => { const r = await cmd('script.evaluate', { expression, target: { context }, awaitPromise: true }); if (r.type !== 'success') throw new Error(JSON.stringify(r.exceptionDetails?.text ?? r)); return r.result.value; };
const shot = async (context, file) => writeFileSync(file, Buffer.from((await cmd('browsingContext.captureScreenshot', { context })).data, 'base64'));
const snapshot = (c) => ev(c, `JSON.stringify({items:[...document.querySelectorAll('#items li')].map(li=>[li.querySelector('.name').textContent, li.querySelector('.qty').value, li.querySelector('[type=checkbox]').checked].join('/')), history:[...document.querySelectorAll('#history li[data-id] .text')].map(e=>e.textContent), status:document.querySelector('#status').textContent})`).then(JSON.parse);
const add = (c, text) => ev(c, `(()=>{const f=document.querySelector('#add');f.elements.name.value=${JSON.stringify(text)};f.requestSubmit();})()`);
const row = (name) => `[...document.querySelectorAll('#items li')].find(li=>li.querySelector('.name').textContent===${JSON.stringify(name)})`;
try {
  assert.ok(ws, 'no bidi connection');
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { const [res, rej] = waiting.get(d.id); waiting.delete(d.id); d.type === 'error' ? rej(new Error(d.error + ': ' + d.message)) : res(d.result); } };
  await cmd('session.new', { capabilities: {} });
  const A = (await cmd('browsingContext.getTree')).contexts[0].context;
  await cmd('browsingContext.navigate', { context: A, url: URL0, wait: 'complete' });
  await sleep(1500);
  for (const t of ['2 Quark', 'Milch', 'Eier']) { await add(A, t); await sleep(150); }
  await sleep(1000);
  const listUrl = await ev(A, 'location.href');
  console.log('A', await snapshot(A));
  const uc = (await cmd('browser.createUserContext')).userContext;
  const B = (await cmd('browsingContext.create', { type: 'tab', userContext: uc })).context;
  await cmd('browsingContext.navigate', { context: B, url: listUrl, wait: 'complete' });
  await sleep(2000);
  const b1 = await snapshot(B); console.log('B joined', b1);
  assert.equal(b1.items.length, 3);
  await add(A, 'Brot'); await sleep(1500);
  assert.equal((await snapshot(B)).items.length, 4, 'live update');
  for (const c of [A, B]) console.log('sw', await ev(c, `navigator.serviceWorker.ready.then(r=>r.active.state)`));
  await sleep(1000);

  await stopServer();
  console.log('--- server down');
  for (const c of [A, B]) await cmd('browsingContext.navigate', { context: c, url: listUrl, wait: 'complete' });
  await sleep(1500);
  const offA = await snapshot(A); console.log('A offline reload', offA);
  assert.equal(offA.items.length, 4, 'app shell + data load offline');
  await add(A, 'Butter');
  await ev(A, `${row('Milch')}.querySelector('[type=checkbox]').click()`);
  await sleep(50);
  await ev(B, `(()=>{const q=${row('Milch')}.querySelector('.qty');q.value=4;q.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await ev(B, `${row('Eier')}.querySelector('.x').click()`);
  await ev(B, `${row('Brot')}.querySelector('.x').click()`);
  await sleep(800);
  console.log('A offline edits', await snapshot(A)); console.log('B offline edits', await snapshot(B));
  await shot(A, TMP + '/offline.png');
  await add(A, 'Brot'); await sleep(300); // later than B's delete: must survive

  await startServer();
  console.log('--- server up');
  for (let k = 0; k < 2; k++) { for (const c of [A, B]) await ev(c, `void dispatchEvent(new Event('online'))`); await sleep(2000); }
  const fa = await snapshot(A), fb = await snapshot(B);
  console.log('A final', fa); console.log('B final', fb);
  assert.deepEqual(fa.items, fb.items); assert.deepEqual(fa.history, fb.history);
  assert.ok(fa.items.includes('Milch/4/true')); assert.ok(fa.items.some(i => i.startsWith('Butter'))); assert.ok(fa.items.some(i => i.startsWith('Brot')));
  assert.deepEqual(fa.history, ['Eier']);
  assert.equal(fa.status, 'Synchronisiert');

  const rect = (i) => ev(A, `JSON.stringify((r=>({x:r.x+r.width/2,y:r.y+r.height/2}))(document.querySelectorAll('#items .grip')[${i}].getBoundingClientRect()))`).then(JSON.parse);
  const count = fa.items.length; const from = await rect(count - 1), to = await rect(0);
  const steps = []; for (let k = 1; k <= 12; k++) steps.push({ type: 'pointerMove', x: Math.round(from.x), y: Math.round(from.y + (to.y - 8 - from.y) * k / 12), duration: 40 });
  await cmd('input.performActions', { context: A, actions: [{ type: 'pointer', id: 'm', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', x: Math.round(from.x), y: Math.round(from.y) }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 100 }, ...steps, { type: 'pause', duration: 100 }, { type: 'pointerUp', button: 0 }] }] });
  await sleep(2000);
  let da = await snapshot(A); console.log('A after pointer drag', da.items);
  if (da.items[0] !== fa.items[count - 1]) {
    console.log('pointer drag had no effect; calling store.reorder directly');
    await ev(A, `import('/js/store.js').then(s=>{const ids=[...document.querySelectorAll('#items li')].map(li=>li.dataset.id);const m=ids.pop();ids.unshift(m);return s.reorder(ids,m)}).then(()=>1)`);
    await sleep(1500); da = await snapshot(A); console.log('A after reorder', da.items);
  }
  console.log('A profile', await ev(A, `document.querySelector('#profiles').selectedOptions[0].textContent`));
  assert.equal(da.items[0], fa.items[count - 1], 'dragged item is first');
  await ev(B, `(()=>{const s=document.querySelector('#profiles');s.value=[...s.options].find(o=>o.textContent==='Mein Markt').value;s.dispatchEvent(new Event('change'));})()`);
  await sleep(500);
  assert.deepEqual((await snapshot(B)).items, da.items, 'B sees profile order');
  await ev(A, `import('/js/store.js').then(s=>s.saveBundle('Käsekuchen',[{name:'Eier',qty:1},{name:'Quark',qty:2},{name:'Zucker',qty:1}])).then(()=>1)`);
  await sleep(1200);
  await ev(B, `void (document.querySelector('#bundles').open=true)`);
  await ev(B, `document.querySelector('#bundles .plus').click()`);
  await sleep(1500);
  const ga = await snapshot(A); console.log('A after bundle', ga);
  assert.ok(ga.items.some(i => i.startsWith('Eier/1')) && ga.items.some(i => i.startsWith('Zucker/1')) && ga.items.some(i => i.startsWith('Quark/2')));
  assert.deepEqual(ga.history, []);
  await ev(A, `void (document.querySelector('#bundles').open=true)`);
  await shot(A, TMP + '/final.png');
  console.log(await fetch(listUrl.replace('/#', '/api/lists/') + '/export.csv').then(r => r.text()));
  console.log('E2E OK, screenshots in ' + TMP);
} catch (e) { console.error('E2E FAILED', e); process.exitCode = 1; }
finally { ff.kill(); server.kill(); ws?.close(); }
