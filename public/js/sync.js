// Client side of the sync protocol (docs/decisions/0006): push the outbox, then pull every list.
// Runs after each local write, when the server announces a change, when the connection or the page
// comes back, and every 30 seconds as a fallback.
import * as replica from './replica.js';
import { state } from './replica.js';

const FALLBACK_INTERVAL_MS = 30_000;
let runAgain = false;
let events;

async function push() {
  for (const [listId, { keys, changes }] of await replica.outbox()) {
    const res = await fetch(`/api/lists/${listId}/changes`, { method: 'POST', body: JSON.stringify({ changes }) });
    if (!res.ok) throw new Error('push failed: ' + res.status);
    await replica.confirm(keys);
  }
}

async function pull() {
  for (const list of state.lists) {
    const res = await fetch(`/api/lists/${list.id}/changes?since=${list.since}`);
    if (!res.ok) throw new Error('pull failed: ' + res.status);
    const { seq, changes } = await res.json();
    await replica.applyRemote(list, changes, seq);
  }
}

export async function sync() {
  // One run at a time; a request during a run schedules exactly one more.
  if (state.syncing) return void (runAgain = true);
  state.syncing = true;
  replica.emit();
  try {
    await push();
    await pull();
    state.online = true;
  } catch {
    state.online = false; // stay usable; the outbox keeps the changes until the next attempt
  }
  state.syncing = false;
  replica.emit();
  if (runAgain) {
    runAgain = false;
    sync();
  }
}

// Listens for "this list changed" announcements from the server.
export function watch(listId) {
  events?.close();
  events = new EventSource(`/api/lists/${listId}/events`);
  events.onmessage = sync;
}

export function start() {
  addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync());
  setInterval(sync, FALLBACK_INTERVAL_MS);
}
