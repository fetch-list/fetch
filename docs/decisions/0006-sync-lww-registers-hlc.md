# 0006: Synchronisation über Last-Writer-Wins-Register mit Hybrid Logical Clocks

- Status: vorgeschlagen
- Datum: 2026-11-10
- Anforderungen: R4, R6, R10

## Kontext

Mehrere Geräte ändern dieselbe Liste, während einige offline sind. Nach dem Wiederverbinden müssen
alle dieselbe Liste haben, und keine Änderung soll ohne einen Grund verloren gehen, den ein Nutzer
akzeptieren würde.

## Optionen

A. Last write wins für die ganze Liste. B. Operationslog, auf dem Server nachgespielt.
C. Last-Writer-Wins-Register pro Feld. D. Eine CRDT-Bibliothek (Automerge, Yjs). E. Eine
Sync-Plattform. Verglichen in [02-research.md](../02-research.md), Abschnitt 3.

## Entscheidung

Option C.

**Datenmodell.** Der gesamte geteilte Zustand ist eine Menge von Registern
`(entity, id, field) → (value, hlc)`. Entitäten sind `list`, `item`, `profile`, `rank`, `bundle`.
Beispiel: `(item, 7f3…, checked) → (true, 0mhsl…:0000:a1b2c3d4)`.

**Konfliktregel.** Ein Schreibvorgang ersetzt ein Register nur, wenn sein Zeitstempel größer ist.
Das ist die gesamte Regel (`wins()` in `public/js/core.js` und die Klausel
`WHERE excluded.hlc > registers.hlc` auf dem Server). Das Zusammenführen ist kommutativ,
assoziativ und idempotent, daher spielen Reihenfolge und Wiederholung von Zustellungen keine Rolle.

**Zeitstempel.** Hybrid Logical Clock: Millisekunden, Zähler, Knoten-ID, als String fester Breite
kodiert, sodass ein String-Vergleich ein Zeitstempel-Vergleich ist. Die Knoten-ID macht
Gleichstände unmöglich.

**Protokoll.**

- `POST /api/lists/{id}/changes` mit `{ changes: [{ entity, id, field, value, hlc }] }`.
  Der Server wendet die Regel an und gibt jeder angenommenen Änderung die nächste Sequenznummer.
- `GET /api/lists/{id}/changes?since={seq}` liefert die Register, die nach diesem Cursor angenommen wurden.
- `GET /api/lists/{id}/events` ist ein Server-Sent-Events-Strom, der „etwas hat sich geändert“ meldet.
- Der Client pusht seine Outbox, pullt dann und speichert den neuen Cursor.

Der Server speichert nur den aktuellen Wert jedes Registers, kein Log.

## Konsequenzen

- Änderungen an verschiedenen Feldern desselben Eintrags kollidieren nie. Bei Änderungen am selben
  Feld gewinnt die spätere, die frühere wird stillschweigend verworfen.
- Jede Nutzeraktion muss alle Felder schreiben, die ihre Absicht ausdrücken. Beim Testen gefunden:
  „Brot hinzufügen“ auf einem Gerät, auf dem Brot schon steht, muss trotzdem `deleted = false`
  schreiben, sonst gewinnt eine gleichzeitige Löschung anderswo, obwohl das Hinzufügen später war.
- Ob „später“ stimmt, hängt von den Geräteuhren ab. Ein Gerät, dessen Uhr weit vorgeht, gewinnt
  Konflikte, bis die echte Zeit aufgeholt hat. Zu prüfende Abhilfe: Der Server lehnt Zeitstempel
  zu weit in der Zukunft ab oder begrenzt sie.
- Keine Historie pro Nutzer, wer was geändert hat, und kein Rückgängigmachen eines verlorenen
  Konflikts. Eine reine Anhängetabelle als Log ließe sich neben den Registern ergänzen, falls die
  Arbeit eines zeigen will.
- Numerische Felder werden als Werte zusammengeführt, nicht als Inkremente: Fügen zwei Personen
  offline je eine Milch hinzu, steht am Ende die spätere Zahl, nicht die Summe.
- Register werden nie entfernt, die Datenbank wächst also nur. Bei Einkaufslisten ist das über
  Jahre unerheblich; eine Aufräumregel für alte Tombstones ist künftige Arbeit.
- Die generische Registertabelle ist kein klassisches relationales Schema. Eine Liste zu lesen
  heißt, Register zu Objekten zusammenzufalten (`materialize()`). Typisierte Tabellen mit einer
  Zeitstempelspalte pro Feld sind die Alternative; sie machen SQL-Abfragen angenehmer und den
  Sync-Code länger.
