// Server-Sent Events: tells every open page of a list that it should pull.
const PING_INTERVAL_MS = 25_000; // keeps proxies from closing idle connections

export function createEventHub() {
  const streams = new Map(); // listId -> Set<ServerResponse>

  return {
    subscribe(req, res, listId, seq) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      });
      res.write(`data: ${seq}\n\n`);
      const set = streams.get(listId) ?? streams.set(listId, new Set()).get(listId);
      set.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), PING_INTERVAL_MS);
      req.on('close', () => {
        clearInterval(ping);
        set.delete(res);
        if (!set.size) streams.delete(listId);
      });
    },

    notify(listId, seq) {
      for (const res of streams.get(listId) ?? []) res.write(`data: ${seq}\n\n`);
    },
  };
}
