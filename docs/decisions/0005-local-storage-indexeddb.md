# 0005: IndexedDB für lokale Daten und die Outbox

- Status: vorgeschlagen
- Datum: 2026-11-10
- Anforderungen: R3

## Kontext

Offline-Änderungen müssen im Browser gespeichert werden und Neuladen und Neustarts überstehen, bis
sie den Server erreichen.

## Optionen

1. `localStorage`.
2. IndexedDB, direkt verwendet.
3. IndexedDB über eine Bibliothek (Dexie, idb).
4. SQLite, nach WebAssembly kompiliert.

Siehe [02-research.md](../02-research.md), Abschnitt 2.

## Entscheidung

Option 2, hinter einem Wrapper von etwa 40 Zeilen (`public/js/db.js`). Drei Object Stores:

- `reg`: die Register aller bekannten Listen (dieselbe Form wie auf dem Server),
- `outbox`: lokale Schreibvorgänge, die der Server noch nicht bestätigt hat,
- `kv`: gerätelokale Einstellungen (Knoten-ID, Uhr, bekannte Listen und ihre Pull-Cursor, aktives Profil).

Ein lokaler Schreibvorgang legt das Register und seinen Outbox-Eintrag in einer Transaktion ab.

## Konsequenzen

- Ein Absturz oder Neuladen zwischen „lokal gespeichert“ und „zum Hochladen vorgemerkt“ kann nicht vorkommen.
- Der gesamte Datenbestand der bekannten Listen liegt im Speicher und wird beim Start aus
  IndexedDB gelesen. Bei Einkaufslisten sind das einige hundert kleine Datensätze.
- Browser können Daten bei Speicherknappheit verdrängen. Die App fordert persistenten Speicher an;
  ob der Browser ihn gewährt, liegt außerhalb ihrer Kontrolle. Nicht synchronisierte Änderungen
  gingen in diesem Fall verloren.
- Mehrere Tabs teilen die Datenbank; ein `BroadcastChannel` sagt anderen Tabs, dass sie neu laden sollen.
