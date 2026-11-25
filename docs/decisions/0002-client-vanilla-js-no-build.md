# 0002: Client in Vanilla JavaScript mit ES-Modulen, ohne Build-Schritt

- Status: vorgeschlagen
- Datum: 2026-11-10
- Anforderungen: R1, R15

## Kontext

Der Client braucht eine Listenansicht, einige Formulare, lokale Speicherung und Sync-Logik. Die
Notizen sagen „überwiegend HTML, CSS und JavaScript; Vanilla JS reicht vermutlich“.

## Optionen

1. Vanilla JS, native ES-Module, kein Bundler.
2. Eine kleine Rendering-Bibliothek (Preact, Alpine, lit-html) ohne Build-Schritt.
3. Ein Framework mit Build-Pipeline (React, Vue, Svelte + Vite).

Siehe [02-research.md](../02-research.md), Abschnitt 8.

## Entscheidung

Option 1. Der Browser lädt die Dateien genau so, wie sie im Repository liegen.

## Konsequenzen

- Kein `npm install`, keine Bundler-Konfiguration, in der Arbeit ist außer der Plattform selbst
  nichts zu erklären. Das Docker-Image kopiert nur Dateien.
- `public/js/core.js` (Uhr- und Merge-Regeln) wird unverändert vom Server und von den Tests
  importiert. Diese gemeinsame Nutzung ist der wichtigste praktische Gewinn.
- Die Oberfläche wird durch Neuaufbau von HTML-Strings neu gerendert (`app.js`). In dieser Größe
  ist das in Ordnung, verliert aber Fokus und Scrollposition in neu gerenderten Teilen. Wird das
  zur Last, lässt sich Option 2 allein für die Ansichtsschicht einführen, ohne Speicherung oder
  Sync anzufassen.
- Kein TypeScript. JSDoc-Typkommentare mit `// @ts-check` sind ein möglicher Mittelweg.
