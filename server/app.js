// Wires the HTTP server together: routing, JSON REST API, static files, error handling.
import http from 'node:http';
import { materialize } from '../public/js/shared/model.js';
import { openDatabase } from './database.js';
import { createRegisterStore, isValidChange } from './registers.js';
import { createEventHub } from './events.js';
import { listToCsv } from './csv.js';
import { serveStatic } from './static.js';
import { HttpError, readJson, sendJson } from './http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LIST_ROUTE = /^\/api\/lists\/([^/]+)(?:\/(changes|events|export\.csv))?$/;

export function createApp({ dbPath = ':memory:' } = {}) {
  const db = openDatabase(dbPath);
  const registers = createRegisterStore(db);
  const events = createEventHub();

  function loadList(listId) {
    const regs = registers.changesSince(listId, 0);
    if (!regs.length) throw new HttpError(404, 'unknown list');
    return materialize(regs);
  }

  async function handleApi(req, res, url) {
    if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true });

    const match = url.pathname.match(LIST_ROUTE);
    if (!match) throw new HttpError(404, 'not found');
    const [, listId, sub] = match;
    if (!UUID_RE.test(listId)) throw new HttpError(400, 'list id must be a UUID');
    const route = `${req.method} ${sub ?? ''}`;

    switch (route) {
      case 'GET changes': {
        const cursor = Number(url.searchParams.get('since') ?? 0);
        if (!Number.isInteger(cursor) || cursor < 0) throw new HttpError(400, 'invalid since');
        const seq = registers.seq; // read before the query so that no change can slip between the two
        return sendJson(res, 200, { seq, changes: registers.changesSince(listId, cursor) });
      }
      case 'POST changes': {
        const body = await readJson(req);
        if (!Array.isArray(body?.changes) || !body.changes.every(isValidChange)) {
          throw new HttpError(400, 'expected { changes: [{ entity, id, field, value, hlc }] }');
        }
        const accepted = registers.apply(listId, body.changes);
        if (accepted) events.notify(listId, registers.seq);
        return sendJson(res, 200, { accepted, seq: registers.seq });
      }
      case 'GET events':
        return events.subscribe(req, res, listId, registers.seq);
      case 'GET export.csv':
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="fetch-${listId.slice(0, 8)}.csv"`,
          'Cache-Control': 'no-store',
        });
        return res.end(listToCsv(loadList(listId)));
      case 'GET ': {
        const list = loadList(listId);
        return sendJson(res, 200, { id: listId, ...list, ranks: Object.fromEntries(list.ranks) });
      }
      default:
        throw new HttpError(405, 'method not allowed');
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else await serveStatic(req, res, url);
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      if (res.headersSent) return res.end();
      const status = err instanceof HttpError ? err.status : 500;
      sendJson(res, status, { error: status === 500 ? 'internal error' : err.message });
    }
  });
  server.on('close', () => db.close());
  return server;
}
