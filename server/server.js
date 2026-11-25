// Fetch! prototype server: JSON REST API + static files, no dependencies.
import http from 'node:http';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { ENTITIES, HLC_RE, materialize, sortItems } from '../public/js/core.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 1024 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function validChange(c) {
  return (
    c && ENTITIES.has(c.entity) &&
    typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 200 &&
    typeof c.field === 'string' && c.field.length > 0 && c.field.length <= 40 &&
    typeof c.hlc === 'string' && HLC_RE.test(c.hlc) &&
    c.value !== undefined && JSON.stringify(c.value).length <= 10_000
  );
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('invalid JSON'), { status: 400 });
  }
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",;\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
};

export function createApp({ dbPath = ':memory:' } = {}) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS registers (
      list_id TEXT NOT NULL,
      entity  TEXT NOT NULL,
      id      TEXT NOT NULL,
      field   TEXT NOT NULL,
      value   TEXT NOT NULL,   -- JSON
      hlc     TEXT NOT NULL,   -- timestamp of the winning write
      seq     INTEGER NOT NULL, -- server-side order of acceptance, used as pull cursor
      PRIMARY KEY (list_id, entity, id, field)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS registers_seq ON registers (list_id, seq);
  `);
  let seq = db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM registers').get().seq;

  // Last writer wins: the row is only replaced if the incoming timestamp is newer.
  const upsert = db.prepare(`
    INSERT INTO registers (list_id, entity, id, field, value, hlc, seq) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (list_id, entity, id, field) DO UPDATE
      SET value = excluded.value, hlc = excluded.hlc, seq = excluded.seq
      WHERE excluded.hlc > registers.hlc`);
  const since = db.prepare(
    'SELECT entity, id, field, value, hlc FROM registers WHERE list_id = ? AND seq > ? ORDER BY seq');
  const parse = (row) => ({ ...row, value: JSON.parse(row.value) });
  const listState = (listId) => since.all(listId, 0).map(parse);

  const streams = new Map(); // listId -> Set<ServerResponse>

  function applyChanges(listId, changes) {
    let accepted = 0;
    db.exec('BEGIN');
    try {
      for (const c of changes) {
        const r = upsert.run(listId, c.entity, c.id, c.field, JSON.stringify(c.value), c.hlc, seq + 1);
        if (r.changes) {
          seq++;
          accepted++;
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      seq = db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM registers').get().seq;
      throw err;
    }
    if (accepted) for (const res of streams.get(listId) ?? []) res.write(`data: ${seq}\n\n`);
    return accepted;
  }

  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  async function api(req, res, url) {
    if (url.pathname === '/api/health') return json(res, 200, { ok: true });

    const m = url.pathname.match(/^\/api\/lists\/([^/]+)(?:\/(changes|events|export\.csv))?$/);
    if (!m) return json(res, 404, { error: 'not found' });
    const [, listId, sub] = m;
    if (!UUID_RE.test(listId)) return json(res, 400, { error: 'list id must be a UUID' });

    if (sub === 'changes' && req.method === 'GET') {
      const cursor = Number(url.searchParams.get('since') ?? 0);
      if (!Number.isInteger(cursor) || cursor < 0) return json(res, 400, { error: 'invalid since' });
      const upTo = seq;
      return json(res, 200, { seq: upTo, changes: since.all(listId, cursor).map(parse) });
    }

    if (sub === 'changes' && req.method === 'POST') {
      const body = await readJson(req);
      if (!Array.isArray(body?.changes) || !body.changes.every(validChange)) {
        return json(res, 400, { error: 'expected { changes: [{ entity, id, field, value, hlc }] }' });
      }
      return json(res, 200, { accepted: applyChanges(listId, body.changes), seq });
    }

    if (sub === 'events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      });
      res.write(`data: ${seq}\n\n`);
      const set = streams.get(listId) ?? streams.set(listId, new Set()).get(listId);
      set.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => {
        clearInterval(ping);
        set.delete(res);
        if (!set.size) streams.delete(listId);
      });
      return;
    }

    if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
    const regs = listState(listId);
    if (!regs.length) return json(res, 404, { error: 'unknown list' });
    const list = materialize(regs);

    if (sub === 'export.csv') {
      const rows = [['name', 'quantity', 'checked', 'deleted']];
      for (const i of sortItems(list.items, list.ranks, null)) {
        rows.push([i.name, i.qty ?? 1, !!i.checked, !!i.deleted]);
      }
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="fetch-${listId.slice(0, 8)}.csv"`,
        'Cache-Control': 'no-store',
      });
      return res.end('﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
    }

    return json(res, 200, { id: listId, ...list, ranks: Object.fromEntries(list.ranks) });
  }

  async function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'forbidden' });
    try {
      const data = await readFile(file);
      // The service worker does the caching; the browser HTTP cache must always revalidate.
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      json(res, 404, { error: 'not found' });
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else await serveStatic(req, res, url);
    } catch (err) {
      if (!err.status) console.error(err);
      if (!res.headersSent) json(res, err.status ?? 500, { error: err.status ? err.message : 'internal error' });
      else res.end();
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  const dbPath = process.env.FETCH_DB ?? 'data/fetch.db';
  const server = createApp({ dbPath }).listen(port, () => console.log(`Fetch! listening on :${port}, db ${dbPath}`));
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      server.closeAllConnections();
      server.close(() => process.exit(0));
    });
  }
}
