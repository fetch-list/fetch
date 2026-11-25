import * as store from './store.js';
import { state } from './store.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const NEW = '__new__';

const els = {
  lists: $('#lists'),
  profiles: $('#profiles'),
  items: $('#items'),
  empty: $('#empty'),
  status: $('#status'),
  clear: $('#clear'),
  history: $('#history ul'),
  bundles: $('#bundles ul'),
  suggest: $('#suggest'),
  export: $('#export'),
  menu: $('.menu'),
};

let dragging = false;
let current; // last rendered view

function render() {
  if (dragging) return;
  const v = (current = store.view());

  els.lists.innerHTML =
    state.lists.map((l) => `<option value="${l.id}">${esc(store.listName(l.id))}</option>`).join('') +
    `<option value="${NEW}">+ Neue Liste …</option>`;
  els.lists.value = state.current;
  document.title = `${store.listName(state.current)} – Fetch!`;
  els.export.href = `/api/lists/${state.current}/export.csv`;

  els.profiles.innerHTML =
    `<option value="">wie hinzugefügt</option>` +
    v.profiles.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') +
    `<option value="${NEW}">+ Neuer Markt …</option>`;
  els.profiles.value = v.profile ?? '';

  els.items.innerHTML = v.active
    .map(
      (i) => `<li data-id="${i.id}" class="${i.checked ? 'done' : ''}">
        <span class="grip" title="Ziehen zum Sortieren" aria-hidden="true">⠿</span>
        <label><input type="checkbox" ${i.checked ? 'checked' : ''}><span class="name">${esc(i.name)}</span></label>
        <input class="qty" type="number" min="1" inputmode="numeric" value="${esc(i.qty ?? 1)}" aria-label="Menge ${esc(i.name)}">
        <button type="button" class="x" aria-label="${esc(i.name)} entfernen">×</button>
      </li>`,
    )
    .join('');
  els.empty.hidden = v.active.length > 0;
  els.clear.disabled = !v.active.some((i) => i.checked);

  els.history.innerHTML =
    v.history
      .slice(0, 30)
      .map(
        (i) => `<li data-id="${i.id}"><span class="text">${esc(i.name)}</span>
        <button type="button" class="plus" aria-label="${esc(i.name)} wieder auf die Liste">+</button></li>`,
      )
      .join('') || `<li class="none">Was du entfernst, landet hier und lässt sich mit einem Tipp zurückholen.</li>`;

  els.bundles.innerHTML =
    v.bundles
      .map(
        (b) => `<li data-id="${b.id}"><span class="text">${esc(b.name)}
        <br><span class="detail">${esc((b.items ?? []).map((i) => `${i.qty} × ${i.name}`).join(', '))}</span></span>
        <button type="button" class="x" aria-label="Bundle ${esc(b.name)} löschen">×</button>
        <button type="button" class="plus" aria-label="Bundle ${esc(b.name)} auf die Liste">+</button></li>`,
      )
      .join('') || `<li class="none">Ein Bundle setzt mehrere Einträge auf einmal auf die Liste, etwa alles für einen Käsekuchen.</li>`;

  els.suggest.innerHTML = v.history.map((i) => `<option value="${esc(i.name)}">`).join('');

  const n = state.pending;
  const waiting = n === 1 ? '1 Änderung wartet' : `${n} Änderungen warten`;
  els.status.className = !state.online ? 'offline' : n ? 'pending' : '';
  els.status.textContent = !state.online
    ? `Offline. ${n ? waiting + ' auf die Verbindung.' : 'Du kannst trotzdem weiterarbeiten.'}`
    : n
      ? `${waiting} auf die Synchronisation.`
      : 'Synchronisiert';
}

// ---- items ----

$('#add').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = e.target.elements.name;
  // "2 Quark" or "2x Quark" sets the quantity.
  const m = input.value.match(/^\s*(\d+)\s*[x×]?\s+(.+)$/i);
  store.addItem(m ? m[2] : input.value, m ? Number(m[1]) : 1);
  input.value = '';
});

els.items.addEventListener('change', (e) => {
  const id = e.target.closest('li').dataset.id;
  if (e.target.type === 'checkbox') store.setItem(id, 'checked', e.target.checked);
  else if (e.target.classList.contains('qty')) store.setItem(id, 'qty', Math.max(1, Math.round(e.target.valueAsNumber) || 1));
});

els.items.addEventListener('click', (e) => {
  if (e.target.classList.contains('x')) store.removeItems([e.target.closest('li').dataset.id]);
});

els.clear.addEventListener('click', () => store.removeItems(current.active.filter((i) => i.checked).map((i) => i.id)));

// SortableJS handles mouse and touch dragging; the native HTML5 drag API does not work on touch screens.
new Sortable(els.items, {
  handle: '.grip',
  forceFallback: true, // same pointer-based dragging for mouse and touch
  animation: 120,
  ghostClass: 'ghost',
  onStart: () => (dragging = true),
  onEnd: async (e) => {
    dragging = false;
    if (e.oldIndex === e.newIndex) return render();
    await store.reorder([...els.items.children].map((li) => li.dataset.id), e.item.dataset.id);
  },
});

els.history.addEventListener('click', (e) => {
  if (!e.target.classList.contains('plus')) return;
  const item = current.history.find((i) => i.id === e.target.closest('li').dataset.id);
  if (item) store.restoreItem(item);
});

// ---- bundles ----

els.bundles.addEventListener('click', (e) => {
  const bundle = current.bundles.find((b) => b.id === e.target.closest('li')?.dataset.id);
  if (!bundle) return;
  if (e.target.classList.contains('plus')) store.addBundle(bundle);
  if (e.target.classList.contains('x') && confirm(`Bundle „${bundle.name}“ löschen?`)) store.removeBundle(bundle.id);
});

$('#save-bundle').addEventListener('click', () => {
  if (!current.active.length) return alert('Setz zuerst die Einträge auf die Liste, die ins Bundle sollen.');
  const name = prompt('Name des Bundles, z. B. Käsekuchen')?.trim();
  if (name) store.saveBundle(name, current.active);
});

// ---- lists and profiles ----

els.lists.addEventListener('change', () => {
  if (els.lists.value !== NEW) return store.select(els.lists.value);
  const name = prompt('Name der neuen Liste')?.trim();
  if (name) store.createList(name);
  else render();
});

els.profiles.addEventListener('change', () => {
  if (els.profiles.value !== NEW) return store.setProfile(els.profiles.value || null);
  const name = prompt('Name des Markts, z. B. Rewe Innenstadt')?.trim();
  if (name) store.createProfile(name);
  else render();
});

els.menu.addEventListener('click', async (e) => {
  const act = e.target.dataset.act;
  if (!act && e.target.id !== 'export') return;
  els.menu.open = false;
  if (act === 'share') {
    const url = `${location.origin}/#${state.current}`;
    // The clipboard API needs a secure context; fall back to showing the link.
    try {
      await navigator.clipboard.writeText(url);
      alert('Link kopiert. Wer ihn öffnet, kann die Liste lesen und bearbeiten.');
    } catch {
      prompt('Link zum Teilen:', url);
    }
  }
  if (act === 'rename') {
    const name = prompt('Neuer Name der Liste', store.listName(state.current))?.trim();
    if (name) store.renameList(name);
  }
  if (act === 'forget' && confirm('Liste von diesem Gerät entfernen? Auf dem Server und bei anderen bleibt sie erhalten.')) {
    store.forgetList();
  }
});

// A link to another list opened in an already running tab.
addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (id && id !== state.current) store.join(id).catch(() => {});
});

store.onChange(render);
await store.init();
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
