# 0003: Server auf Node.js mit eingebauten HTTP- und SQLite-Modulen

- Status: vorgeschlagen
- Datum: 2026-11-10
- Anforderungen: R10, R12, R14

## Kontext

Der Server speichert Listendaten, bietet eine JSON-REST-API und einen CSV-Export und liefert den
statischen Client aus. Die Last ist winzig (Haushalte), und die Datenbank muss SQLite sein.

## Optionen

1. Node.js, `node:http`, `node:sqlite`, keine npm-Abhängigkeiten.
2. Node.js mit einem Framework (Express, Fastify, Hono) und `better-sqlite3`.
3. Python (FastAPI) oder Go.

Siehe [02-research.md](../02-research.md), Abschnitt 7.

## Entscheidung

Option 1 für den Prototyp.

- Eine Sprache für Client und Server: Die Merge-Regeln werden einmal geschrieben und einmal getestet.
- Keine Abhängigkeiten: nichts zu prüfen oder zu aktualisieren, und das Dockerfile hat zehn Zeilen.
- Die synchrone API von SQLite in einem einzigen Prozess bedeutet, dass jeder Stapel von
  Änderungen eine Transaktion ist und der Sequenzzähler keine Sperren braucht.

## Konsequenzen

- Routing, Body-Parsing und Validierung sind von Hand geschrieben (etwa 60 von 220 Zeilen). Bei
  deutlich mehr Routen würde sich ein Framework lohnen; Hono oder Fastify lassen sich später
  ergänzen, ohne Datenbank oder Protokoll zu ändern.
- `node:sqlite` ist eine junge Ergänzung von Node. Seine Stabilitätsstufe muss vor der endgültigen
  Entscheidung geprüft werden. `better-sqlite3` hat fast dieselbe API und ist die Ausweichlösung.
- Ein Prozess, eine Datei: keine horizontale Skalierung. Für diesen Einsatz nicht nötig.
- Benötigt Node 24 oder neuer.
