# Ergebnisse des Prototyps

Datum: 2026-11-10. Branch: `prototype/feasibility`.

## Urteil

**Das Projekt ist mit einem sehr kleinen Stack machbar.** Für alle Muss-Anforderungen gibt es im
Prototyp eine funktionierende Umsetzung: etwa 1.200 Zeilen eigener Code, keine npm-Abhängigkeiten,
kein Build-Schritt, zwei mitgelieferte Browser-Bibliotheken. Der schwierige Teil des Themas,
Offline-Bearbeitung mit Konvergenz zwischen mehreren Nutzern, wird durch eine Regel gelöst, die in
einen Satz passt und sich erschöpfend testen lässt (ADR 0006). Das verbleibende Risiko ist nicht
„geht das“, sondern eine Reihe von Produkt- und Bereitstellungsfragen, die unten gesammelt sind.

Antworten auf die Fragen aus [01-goals.md](01-goals.md):

- **F1** Ja. Service Worker + Cache API (R2) und IndexedDB (R3) genügen. Einschränkung: HTTPS ist nötig.
- **F2** Ja. Last-Writer-Wins-Register pro Feld mit Hybrid Logical Clocks. Uhr-, Merge- und
  Sortierregeln umfassen 120 Zeilen, die Client und Server teilen.
- **F3** Ja. Sortierprofile, Historie und Bündel sind gewöhnliche Register; keines brauchte eigenen Sync-Code.
- **F4** Ein Node-Prozess, eingebaute HTTP- und SQLite-Module, eine Datenbanktabelle, ein Container.
- **F5** Siehe „Befunde“ unten; die drei wichtigsten sind HTTPS, die Abhängigkeit von Geräteuhren
  und die Bedeutung von „Nutzer“.

## Was existiert

| Anforderung | Stand im Prototyp | Wo | ADR |
|---|---|---|---|
| R1 Handy + Desktop | Einspaltiges Layout, touchgerechte Zeilen, Eingabe am unteren Rand | `public/index.html`, `public/app.css` | 0010 |
| R2 lädt offline | Service Worker cacht die App-Shell | `public/sw.js` | 0004 |
| R3 Offline-Änderungen | Alle Schreibvorgänge gehen zuerst in IndexedDB, mit Outbox | `public/js/store.js`, `db.js` | 0005 |
| R4 Sync + Konflikte | LWW-Register, HLC, Push/Pull mit Cursor, SSE-Benachrichtigung | `public/js/core.js`, `server/server.js` | 0006 |
| R5 mehrere Listen | Listenwechsel, Anlegen, Umbenennen, vom Gerät entfernen | `store.js`, `app.js` | 0007 |
| R6 Teilen | Link mit der Listen-UUID | `app.js` | 0007 |
| R7 Sortierung | Benannte Profile, Drag & Drop schreibt fraktionale Ränge | `core.js` (`rankWrites`) | 0008 |
| R8 Historie | Weiches Löschen, Abschnitt „Zuletzt entfernt“, Wiederherstellen mit einem Tipp | `store.js` | 0009 |
| R9 Bündel | Aktuelle Liste als Bündel speichern, Bündel hinzufügen | `store.js` | 0009 |
| R10 JSON-REST-API | Siehe unten | `server/server.js` | 0003, 0006 |
| R11 CSV-Export | `GET /api/lists/{id}/export.csv` | `server/server.js` | 0003 |
| R12 Docker | `Dockerfile`, `compose.yaml` | Wurzel des Repositorys | 0003 |
| R13 Open Source | MIT-Lizenz (bereits im Repository) | `LICENSE` | |
| R14 SQLite | Eine Tabelle `registers` | `server/server.js` | 0003 |

API:

| Methode und Pfad | Zweck |
|---|---|
| `GET /api/health` | Lebenszeichen |
| `GET /api/lists/{id}` | Aktuelle Liste als einfaches JSON (Einträge, Profile, Bündel, Ränge) |
| `GET /api/lists/{id}/changes?since={seq}` | Register, die nach dem Cursor geändert wurden |
| `POST /api/lists/{id}/changes` | Änderungen einreichen; Antwort nennt die Zahl der angenommenen |
| `GET /api/lists/{id}/events` | Server-Sent Events: eine Nachricht bei jeder Änderung der Liste |
| `GET /api/lists/{id}/export.csv` | CSV-Download |

## Was geprüft wurde, und wie

- **Unit- und API-Tests** (`npm test`, 7 Tests, alle grün): Monotonie der Uhr, Konvergenz bei
  umgekehrter Zustellreihenfolge, Rangberechnung, zwei Clients, die gleichzeitige
  Offline-Änderungen über den echten Server synchronisieren, idempotenter erneuter Push,
  Eingabevalidierung, CSV.
- **End-to-End im Headless-Firefox** (`node tools/e2e-firefox.mjs`, grün): zwei getrennte
  Browserprofile auf einer Liste. Live-Aktualisierung von einem zum anderen. Server beendet,
  beide Seiten neu geladen und mit ihren Daten aus dem Service-Worker-Cache dargestellt. Beide
  haben bearbeitet, während der Server aus war (hinzufügen, abhaken, Menge ändern, löschen, erneut
  hinzufügen). Server neu gestartet: Beide konvergierten zur selben Liste und Historie.
  Reihenfolge des Sortierprofils und ein auf einer Seite angelegtes Bündel erschienen auf der
  anderen. CSV stimmte überein.
- **Docker**: Image baut, Container startet, Health-Check und API antworten.

## Was nicht geprüft wurde

- **Chromium**. Auf dem Entwicklungsrechner nicht installiert. Nichts Firefox-Spezifisches wird
  verwendet, aber R1 nennt Chromium, also muss es getestet werden.
- **Ein echtes Handy und echtes Ziehen per Touch.** Im automatisierten Lauf hatte simuliertes
  Ziehen mit dem Pointer keine Wirkung auf die Liste, daher rief der Test die Sortierfunktion
  direkt auf. Ob das eine Grenze des Testtreibers oder ein Problem der Drag-Einrichtung ist, ist
  unbekannt. Zuerst von Hand ausprobieren.
- **Betrieb hinter HTTPS** und die Installation der App auf dem Startbildschirm eines Handys.
- **Lange Offline-Phasen, Verdrängung des Speichers, große Listen, viele Listen.**
- Barrierefreiheit über Beschriftungen und Fokusstile hinaus; Screenreader; Sortieren per Tastatur.

## Befunde

Geordnet danach, wie stark sie die Planung beeinflussen sollten.

1. **Offline-Unterstützung braucht HTTPS.** Service Worker laufen nur unter `https://` oder
   `localhost`. Wer den Container startet und auf dem Handy `http://192.168.1.20:8080` öffnet,
   bekommt eine funktionierende Online-App ohne Offline-Start. Die Docker-Dokumentation (R12) muss
   daher TLS abdecken, z. B. mit einem Caddy-Container in der Compose-Datei. Das ist die größte
   Lücke zwischen „läuft in Docker“ und „Anforderung R2 für einen Tester erfüllt“.

2. **Last-Writer-Wins braucht Schreibvorgänge, die die volle Absicht ausdrücken.** Die erste
   Version von „Eintrag hinzufügen“ schrieb nur Menge und Abhak-Status, wenn der Eintrag schon auf
   der Liste stand. Hatte ein anderes Gerät ihn inzwischen gelöscht, gewann die Löschung, obwohl
   das Hinzufügen später kam. Die Korrektur war, immer `deleted = false` zu schreiben. Die
   allgemeine Lehre für die Arbeit: Beim Zusammenführen pro Feld ist eine Aktion die Menge der
   Felder, die sie schreibt, und diese Menge muss für jede Aktion entworfen werden.

3. **Die Konfliktauflösung vertraut Geräteuhren.** Die Hybrid Logical Clock verhindert, dass ein
   Gerät rückwärts läuft oder Gleichstände erzeugt, aber ein Handy, das einen Tag vorgeht, gewinnt
   einen Tag lang jeden Konflikt. Optionen: Zeitstempel weit in der Zukunft auf dem Server ablehnen
   oder begrenzen; auf dem Client warnen, wenn seine Uhr vom `Date`-Header des Servers abweicht.
   Nicht umgesetzt.

4. **„Nutzer“ ist nicht definiert.** Es gibt keine Konten. Sortierprofile sind benannt, werden
   innerhalb der Liste geteilt und pro Gerät ausgewählt (ADR 0008). Die Menge der bekannten Listen
   liegt auf jedem Gerät (ADR 0007). Ob das „jeder Nutzer … individuelles Sortierschema“ erfüllt,
   sollte früh gefragt werden, denn echte Konten würden den Server erheblich verändern.

5. **Offener Server.** Wer den Server erreicht, kann Listen anlegen und in jede Liste schreiben,
   deren UUID er kennt. Für einen Heimserver hinter einem VPN ist das in Ordnung. Für eine
   öffentliche Adresse braucht es mindestens Rate Limiting und eine Größengrenze pro Liste,
   vielleicht ein Instanzpasswort.

6. **Updates kommen einen Ladevorgang zu spät.** Mit Stale-while-revalidate sieht der Nutzer eine
   neue Version erst beim zweiten Besuch, und für einen Ladevorgang können Dateien zweier Versionen
   gemischt sein. Für einen Prototyp akzeptabel; die echte App sollte ihren Cache versionieren und
   den Nutzer wohl zum Neuladen auffordern.

7. **Der Sync läuft nur bei offener Seite.** Firefox hat kein Background Sync. Eine offline
   gemachte Änderung wird hochgeladen, wenn die App das nächste Mal mit Verbindung geöffnet wird.
   Die Statuszeile zeigt, wie viele Änderungen warten; das macht es sichtbar.

8. **Die Daten wachsen nur.** Gelöschte Einträge, ungenutzte Ränge und alte Bündel bleiben für
   immer als Register erhalten. In diesem Umfang harmlos, aber die Arbeit sollte das erwähnen und
   eine Aufräumregel skizzieren.

9. **Generische Tabelle oder typisierte Tabellen.** Eine Tabelle `registers` hielt Server- und
   Sync-Code kurz. Als relationaler Entwurf ist sie ungewöhnlich und macht spontane SQL-Abfragen
   umständlich. Das ist eine echte Entwurfsentscheidung für die Hauptimplementierung und ein guter
   Vergleich für die Arbeit.

10. **Derselbe Eintrag auf zwei Offline-Geräten erscheint doppelt.** Jedes Gerät erzeugt eine
    eigene ID für „Milch“. Leitet man die ID aus Liste und normalisiertem Namen ab, würden sie
    automatisch zusammengeführt, um den Preis komplizierterer Umbenennungen.

11. **Fraktionale Positionen sind Gleitkommazahlen.** Für normale Nutzung genug; String-Schlüssel
    heben die Grenze auf (ADR 0008).

12. **CSV-Details.** Der Export ist kommagetrenntes UTF-8 mit Byte-Order-Mark. Deutsches Excel
    erwartet beim Öffnen per Doppelklick Semikolons. Zellen, die mit `=`, `+`, `-` oder `@`
    beginnen, sollten gegen Formel-Injection in Tabellenkalkulationen entschärft werden. Beides ist
    nicht umgesetzt.

13. **Abkürzungen in der Oberfläche.** `prompt()`- und `confirm()`-Dialoge, erzwungenes helles
    Design, deutsche Texte direkt im Code, vollständiges Neurendern bei jeder Änderung. Bündel
    lassen sich nur aus der aktuellen Liste anlegen und nicht bearbeiten. Für einen Prototyp in
    Ordnung, alles neu zu machen.

14. **Die Reife von `node:sqlite`** muss bestätigt werden (ADR 0003). Das Docker-Image ist wegen
    des Node-Basisimages 244 MB groß; kein Problem, aber es ginge kleiner.

## Vorgeschlagene nächste Schritte

1. Den Prototyp von Hand auf einem Handy und in Chromium ausprobieren (siehe README), besonders das Ziehen.
2. Befunde 4 und 5 mit dem Betreuer klären: Was zählt als Nutzer, und wer darf den Server erreichen.
3. Über ADR 0002, 0003 und 0006 im Team entscheiden; sie prägen alles andere. Als angenommen
   markieren oder ersetzende ADRs schreiben.
4. Die eigentliche Implementierung auf einem neuen Branch beginnen. `core.js` und seine Tests als
   Keim behalten; Oberfläche und Server mit sauberer Struktur, Fehlerbehandlung und Browsertests
   neu schreiben (Playwright deckt Firefox und Chromium ab und kann Offline-Betrieb und Touch simulieren).
5. HTTPS in die Compose-Konfiguration aufnehmen, bevor der Betreuer das Offline-Verhalten testet.
