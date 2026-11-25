# 0010: Pico CSS für die Grundgestaltung, SortableJS für Drag & Drop, beide mitgeliefert

- Status: vorgeschlagen
- Datum: 2026-11-10
- Anforderungen: R1, R7, R16

## Kontext

Die App muss auf Handy und Desktop gut aussehen und funktionieren, ohne dass CSS zum
Hauptaufwand wird. Drag & Drop muss per Touch funktionieren, was die native HTML5-Drag-API nicht
unterstützt.

## Optionen

CSS: nur von Hand, Pico CSS, Tailwind, Bootstrap/Bulma, Web-Component-Kits.
Drag & Drop: eigene Pointer-Events, SortableJS.
Siehe [02-research.md](../02-research.md), Abschnitte 5 und 9.

## Entscheidung

- **Pico CSS 2.1.1** gestaltet reine HTML-Elemente. `public/app.css` (etwa 260 Zeilen) setzt
  Farben über Picos Custom Properties und ergänzt das App-Layout: mitlaufende Kopfzeile,
  Listenzeilen mit großen Touch-Flächen, Eingabeleiste am unteren Rand in Daumenreichweite.
- **SortableJS 1.15.6** mit einem Ziehgriff pro Zeile, damit sich die Liste per Touch weiterhin scrollen lässt.
- Beide sind MIT-lizenzierte Einzeldateien, kopiert nach `public/vendor/`. Kein CDN: Die App muss
  offline und in Netzen ohne Internetzugang funktionieren, und der Service Worker cacht sie.

## Konsequenzen

- Für den Client ist kein Paketmanager nötig. Aktualisieren heißt, eine Datei zu ersetzen und die Version hier zu vermerken.
- Pico ist etwa 80 kB groß, wovon die App einen Bruchteil nutzt. Seine Voreinstellungen (Abstände,
  Steuerelemente in voller Breite) werden an mehreren Stellen überschrieben. Wachsen die
  Überschreibungen weiter, ist handgeschriebenes CSS für diese kleine Oberfläche eine realistische Alternative.
- Der Prototyp erzwingt das helle Design, nutzt die Browser-Dialoge `prompt()`/`confirm()` für
  Namen und Bestätigungen und hat deutsche Texte direkt in `index.html` und `app.js`. Alle drei
  sind Abkürzungen, keine Entscheidungen.
