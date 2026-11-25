# Recherche: Optionen je Thema

Je Thema: die Optionen, was in diesem Projekt für und gegen sie spricht, und die Wahl für den
Prototyp. Zu jeder Wahl gibt es einen ADR mit der vollständigen Begründung. Anforderungs-IDs
beziehen sich auf [01-goals.md](01-goals.md).

Die Quellenliste am Ende ist ein Ausgangspunkt für das Literaturverzeichnis der Arbeit. Nur die
mit „geprüft“ markierten Einträge wurden beim Schreiben dieses Dokuments geöffnet; jede Quelle
vor dem Zitieren prüfen.

## 1. Die Anwendung offline laden (R2)

| Option | Bewertung |
|--------|-----------|
| Nur HTTP-Cache-Header (`Cache-Control: immutable`, langes `max-age`) | Der Browser darf Einträge jederzeit verwerfen und versucht die Navigationsanfrage trotzdem. Kein garantierter Offline-Start. |
| AppCache | Aus den Browsern entfernt. Keine Option. |
| **Service Worker + Cache API** | Der Standardmechanismus. Ein Skript fängt Anfragen ab und beantwortet sie aus einem Cache, den es selbst verwaltet. Von Firefox und Chromium unterstützt. |

Caching-Strategien für Service Worker [S2]:

- *Cache first*: am schnellsten, aber eine neue Version kommt erst an, wenn sich der Cache-Name ändert.
- *Network first*: online immer aktuell, bei schlechter Verbindung langsam (der typische Fall im Supermarkt).
- *Stale-while-revalidate*: aus dem Cache antworten, im Hintergrund aktualisieren. Schnell und
  selbstaktualisierend, aber eine neue Version ist erst beim nächsten Laden sichtbar.

Gefundene Einschränkungen:

- Service Worker laufen nur in einem **sicheren Kontext**: HTTPS oder `http://localhost` [S3, geprüft].
  Eine selbst gehostete Instanz, die vom Handy als `http://192.168.x.x` aufgerufen wird, hat keine
  Offline-Unterstützung. Das betrifft die Docker-Dokumentation (R12).
- Firefox führt in privaten Fenstern keine Service Worker aus.

Wahl für den Prototyp: Service Worker mit Stale-while-revalidate, [ADR 0004](decisions/0004-offline-shell-service-worker.md).

## 2. Daten im Browser speichern (R3)

| Option | Bewertung |
|--------|-----------|
| `localStorage` | Synchron, nur Strings, etwa 5 MB, keine Transaktionen, im Service Worker nicht nutzbar. |
| **IndexedDB** | Asynchron, transaktional, strukturierte Daten, großes Kontingent. Umständliche API, die ein Wrapper von 30 Zeilen verbirgt. |
| SQLite im Browser (WASM + OPFS) | Dieselbe Abfragesprache auf beiden Seiten, aber mehrere hundert kB Download, braucht Worker und spezielle Header. Für eine Einkaufsliste zu schwer. |
| Wrapper-Bibliotheken (Dexie, idb) | Angenehmere API. Lohnt sich erst bei komplexen Abfragen. |

Browser dürfen Daten eines Ursprungs bei Speicherknappheit verwerfen, solange keine Persistenz
gewährt ist; `navigator.storage.persist()` fordert sie an [S5].

Wahl für den Prototyp: IndexedDB direkt, [ADR 0005](decisions/0005-local-storage-indexeddb.md).

## 3. Synchronisation und Konfliktauflösung (R4)

Das ist der Kern der Arbeit, deshalb sind die Optionen ausführlicher beschrieben.

| Option | Funktionsweise | Bewertung |
|--------|----------------|-----------|
| A. Last write wins für die ganze Liste | Der Client lädt die Liste hoch, der neueste Upload ersetzt die Serverkopie. | Trivial, aber Offline-Änderungen zweier Personen überschreiben sich. Verfehlt den Sinn von R4. |
| B. Operationslog, auf dem Server nachgespielt | Clients zeichnen Aktionen mit Zeitstempel auf und senden sie später; der Server wendet sie der Reihe nach an. (Die Idee aus den Projektnotizen.) | Verständlich. Braucht Regeln für jedes Paar widersprüchlicher Aktionen und für verspätet eintreffende alte Aktionen. |
| C. **Zustandsbasierte Register mit Last-Writer-Wins pro Feld** | Jedes Feld jedes Eintrags speichert seinen Wert und den Zeitstempel seines letzten Schreibens. Beim Zusammenführen zweier Zustände bleibt pro Feld der neuere Wert. | Ein einfaches CRDT [S7]. Das Zusammenführen ist kommutativ, assoziativ und idempotent, daher konvergieren Replikate unabhängig von der Zustellreihenfolge. Klein genug, um es selbst zu schreiben und per Test zu belegen. Wird in Actual Budget produktiv eingesetzt [S9, geprüft]. |
| D. Allgemeine CRDT-Bibliotheken (Automerge, Yjs) | Die Bibliothek hält ein Dokument mit vollständiger Historie und führt automatisch zusammen. | Mächtig (Textbearbeitung, Listen), aber undurchsichtiger Binärzustand auf dem Server, der mit einem schlichten SQLite-Schema, REST-API und CSV-Export kollidiert (R10, R11, R14). Lässt wenig vom Sync-Entwurf als eigene Leistung übrig. |
| E. Sync-Plattformen (CouchDB/PouchDB, RxDB, ElectricSQL, PowerSync, Replicache/Zero) | Ein Produkt übernimmt die Replikation. | Jede bringt eigene Anforderungen an Server oder Datenbank (CouchDB, PostgreSQL) oder Lizenzbedingungen mit. Widerspricht R14, und das Thema der Arbeit schrumpft auf Konfiguration. |

Option C ist Option B mit einer einheitlichen Konfliktregel: Jeder Logeintrag lautet „setze Feld F
von Entität E zum Zeitpunkt T auf V“, und die einzige Regel ist „neueres T gewinnt“. Verschiedene
Felder kollidieren nie, also bleiben „A hakt Milch ab“ und „B ändert die Menge“ beide erhalten.

Zeitstempel: Geräteuhren sind unzuverlässig. Eine **Hybrid Logical Clock** (HLC) [S8] kombiniert
die Wanduhrzeit mit einem Zähler und einer Knoten-ID. Sie läuft auf einem Gerät nie rückwärts,
springt über jeden gesehenen Zeitstempel hinaus und liefert eine totale Ordnung ohne Gleichstände.
Ein Gerät, dessen Uhr weit vorgeht, korrigiert sie nicht: Es gewinnt Konflikte, bis die anderen
aufgeholt haben.

Transport: Clients brauchen „alles, was sich seit meiner letzten Anfrage geändert hat“. Eine
serverseitige Sequenznummer pro angenommenem Schreibvorgang liefert einen Cursor, der nicht von
Client-Uhren abhängt.

Auslösen der Synchronisation: Mit der Background Sync API könnte ein Service Worker auch nach dem
Schließen der Seite synchronisieren, aber Firefox implementiert sie nicht [S4, geprüft]. Der Sync
läuft daher, solange die Seite offen ist: bei Änderungen, beim `online`-Ereignis, wenn der Tab
sichtbar wird, und per Timer.

Live-Aktualisierung zwischen Nutzern: Polling, Server-Sent Events (SSE) oder WebSockets. SSE ist
einseitig, reines HTTP, verbindet sich selbst neu und braucht keine Bibliothek. Das genügt, um
Clients „jetzt abrufen“ zu sagen.

Wahl für den Prototyp: Option C mit HLC, [ADR 0006](decisions/0006-sync-lww-registers-hlc.md).

## 4. Teilen und Identität (R5, R6)

| Option | Bewertung |
|--------|-----------|
| Konten mit Passwort | Vertraut, bringt aber Registrierung, Passwortspeicherung, Zurücksetzen und Sessions mit: viel Code außerhalb des Schwerpunkts der Arbeit. |
| Externe Identität (OIDC) | Für ein kleines selbst gehostetes Werkzeug unverhältnismäßig. |
| **Nicht erratbare Listen-ID als Schlüssel** (Capability-URL) | Wer den Link hat, kann die Liste lesen und schreiben. Kein Login. Passt zu den Notizen („Teilen simpel über UUID“). Zugriff lässt sich einer einzelnen Person nicht entziehen. |

Wahl für den Prototyp: Listen-UUID als Capability, [ADR 0007](decisions/0007-sharing-by-list-uuid.md).

## 5. Sortierung pro Nutzer (R7)

Zwei Teilfragen.

*Was wird sortiert?* Gehören Positionen zu Eintragsinstanzen, geht die Reihenfolge verloren, wenn
„Milch“ gelöscht und nächste Woche neu hinzugefügt wird. Gehören Positionen zu **Eintragsnamen
innerhalb eines Sortierprofils**, wird ein Ladenaufbau einmal gelernt und wiederverwendet.

*Wie wird eine Position gespeichert?*

| Option | Bewertung |
|--------|-----------|
| Ganzzahliger Index pro Eintrag | Ein Verschieben nummeriert viele Zeilen neu, und gleichzeitige Verschiebungen kollidieren stark. |
| Geordnetes Array von IDs als ein Wert | Ein Register für die gesamte Reihenfolge: Sortieren zwei Personen gleichzeitig, geht ein Ergebnis vollständig verloren. |
| **Fraktionaler Index** | Ein verschobener Eintrag bekommt eine Position zwischen seinen beiden Nachbarn. Ein Schreibvorgang pro Ziehen, und unabhängige Verschiebungen lassen sich zusammenführen [S10]. Gleitkomma-Mittelwerte verlieren nach etwa 50 Einfügungen an derselben Stelle ihre Genauigkeit; String-Schlüssel vermeiden das. |

Drag & Drop: Die native HTML5-Drag-API feuert auf Touchscreens nicht. Optionen sind eine
Bibliothek (SortableJS: keine Abhängigkeiten, etwa 45 kB minifiziert, Maus und Touch) oder eine
eigene Behandlung von Pointer-Events.

Wahl für den Prototyp: benannte Profile, Rang pro (Profil, Eintragsname), Gleitkommazahlen,
SortableJS; [ADR 0008](decisions/0008-sort-profiles-fractional-rank.md).

## 6. Historie und Bündel (R8, R9)

Löschen braucht in einem replizierten System ohnehin Tombstones: Ein gelöschter Eintrag muss als
Markierung erhalten bleiben, sonst bringt ein Replikat, das von der Löschung nichts weiß, ihn
zurück. Genau diese Markierung ist die Historie, die R8 verlangt. Bündel sind eine benannte Liste
von Paaren (Name, Menge) und brauchen keinen eigenen Mechanismus. Siehe
[ADR 0009](decisions/0009-history-and-bundles.md).

## 7. Serversprache, Framework, Datenbank (R10, R14, R15)

| Option | Dafür | Dagegen |
|--------|-------|---------|
| **Node.js** | Dieselbe Sprache wie der Client, die Merge-Logik existiert also einmal und wird geteilt. SQLite ist eingebaut (`node:sqlite`), ein Test-Runner ebenfalls. | `node:sqlite` ist jung (siehe unten). |
| Python (FastAPI) | Gut lesbar, SQLite in der Standardbibliothek. | Zweite Sprache; Merge-Logik doppelt geschrieben. |
| Go | Ein statisches Binary, winziges Docker-Image. | Zweite Sprache; SQLite braucht cgo oder eine reine Go-Portierung. |
| PHP, Java, … | | Hier kein Vorteil. |

HTTP-Framework: Die API hat fünf Routen. Express, Fastify oder Hono würden Validierung und
Routing-Komfort mitbringen. Der Prototyp nutzt `node:http` direkt, um herauszufinden, ob das
genügt; es genügte (etwa 200 Zeilen).

SQLite-Zugriff: `node:sqlite` (eingebaut, synchron) oder `better-sqlite3` (ausgereift, braucht
einen nativen Build-Schritt im Docker-Image). Unter dem hier verwendeten Node 24.22 lädt
`node:sqlite` ohne Flag und ohne Warnung. Seine offizielle Stabilitätsstufe ließ sich bei der
Recherche nicht bestätigen; vor der Festlegung den Stabilitätsindex in [S11] prüfen.
`better-sqlite3` hat eine fast gleiche API und ist die Ausweichlösung.

Wahl für den Prototyp: [ADR 0003](decisions/0003-server-node-sqlite.md).

## 8. Client-Framework und Build-Werkzeuge (R15)

| Option | Bewertung |
|--------|-----------|
| **Vanilla JS mit ES-Modulen, ohne Build-Schritt** | Nichts zu installieren oder zu konfigurieren; die Dateien im Repository sind die Dateien, die der Browser ausführt. Das Rendern von Hand wird mühsam, wenn die Oberfläche wächst. |
| Kleine Bibliotheken (Preact, Alpine, lit-html) | Deklaratives Rendern für 4 bis 10 kB. Ein sinnvoller späterer Schritt, falls das Rendern von Hand schmerzt. |
| React, Vue, Svelte mit Vite | Produktiv für große Oberflächen, bringt aber Build-Pipeline, Abhängigkeiten und Konzepte mit, die die Arbeit erklären müsste und die die Notizen vermeiden wollen. |

Wahl für den Prototyp: Vanilla, [ADR 0002](decisions/0002-client-vanilla-js-no-build.md).

## 9. CSS und Gestaltung (R1, R16)

| Option | Bewertung |
|--------|-----------|
| Alles CSS von Hand | Volle Kontrolle, größter Aufwand. |
| **Klassenloses/minimales CSS (Pico CSS)** | Gestaltet reine HTML-Elemente sinnvoll: Formulare, Buttons, Typografie, Fokuszustände, Dark Mode. Etwa 80 kB, kein Build-Schritt. Das app-spezifische Layout muss trotzdem geschrieben werden. |
| Utility-Framework (Tailwind) | Braucht einen Build-Schritt. |
| Komponenten-Frameworks (Bootstrap, Bulma) | Größer, und die Komponenten sind für Websites gedacht, nicht für eine Touch-Liste. |
| Web-Component-Kits (Shoelace/Web Awesome) | Gute Komponenten, aber schwerer und teils kommerziell. |

Wahl für den Prototyp: Pico CSS plus ein kleines Stylesheet, [ADR 0010](decisions/0010-ui-pico-css-sortablejs.md).

## 10. Bereitstellung (R12)

Ein Container, ein Prozess, eine SQLite-Datei auf einem Volume. Weil der Prototyp keine
npm-Abhängigkeiten hat, kopiert das Dockerfile nur Dateien in ein Node-Basisimage. Offener Punkt:
HTTPS (siehe Abschnitt 1). Ein Reverse Proxy mit automatischen Zertifikaten (z. B. Caddy) in der
Compose-Datei ist die übliche Antwort beim Selbsthosten.

## Quellen

- [S1] M. Kleppmann, A. Wiggins, P. van Hardenberg, M. McGranaghan: *Local-first software: You own your data, in spite of the cloud*. Onward! 2019. https://www.inkandswitch.com/local-first/
- [S2] J. Archibald: *The offline cookbook*. https://web.dev/articles/offline-cookbook
- [S3] MDN: *Secure contexts*. https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts (geprüft 2026-11-10)
- [S4] MDN: *Background Synchronization API*, https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API und https://caniuse.com/background-sync (geprüft 2026-11-10: in Firefox nicht unterstützt)
- [S5] MDN: *Storage quotas and eviction criteria*. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- [S6] MDN: *Service Worker API* und *IndexedDB API*. https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API, https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- [S7] M. Shapiro, N. Preguiça, C. Baquero, M. Zawirski: *Conflict-free Replicated Data Types*. SSS 2011 (auch INRIA RR-7687).
- [S8] S. Kulkarni, M. Demirbas et al.: *Logical Physical Clocks and Consistency in Distributed Databases*. 2014. https://cse.buffalo.edu/tech-reports/2014-04.pdf
- [S9] J. Long: *Actual: Using CRDTs in the Wild* (2019), https://archive.jlongster.com/using-crdts-in-the-wild (geprüft 2026-11-10), und der Vortrag *CRDTs for Mortals* (dotJS 2019).
- [S10] E. Wallace: *Realtime editing of ordered sequences*. Figma-Blog, 2017. https://www.figma.com/blog/realtime-editing-of-ordered-sequences/
- [S11] Node.js-Dokumentation: *SQLite*. https://nodejs.org/api/sqlite.html
- [S12] SortableJS, https://github.com/SortableJS/Sortable (MIT). Pico CSS, https://picocss.com (MIT).
- [S13] RFC 4180: *Common Format and MIME Type for Comma-Separated Values (CSV) Files*.
