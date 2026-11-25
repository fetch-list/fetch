# Fetch! – Projektdokumentation

Dieser Ordner hält fest, was das Projekt erreichen soll, was recherchiert wurde, welche
Entwurfsentscheidungen getroffen wurden und warum. Er dient dazu, dass die schriftliche Arbeit für
jede Entscheidung eine Begründung zitieren kann.

Lesereihenfolge:

1. [01-goals.md](01-goals.md): Anforderungen mit IDs, Nicht-Ziele und die Fragen an den Prototyp.
2. [02-research.md](02-research.md): untersuchte Optionen je Thema, mit Quellen.
3. [decisions/](decisions/): ein Architecture Decision Record (ADR) pro Entscheidung.
4. [03-findings.md](03-findings.md): Ergebnisse des Prototyps, Machbarkeitsurteil, offene Fragen.

## Stand dieses Branches

`prototype/feasibility` ist eine Erkundung zum Wegwerfen. Ziel ist Erkenntnis, nicht Produktivcode.
Alle ADRs haben hier den Status **vorgeschlagen**: Sie beschreiben, was der Prototyp tut und warum.
**Angenommen** werden sie erst, wenn beide Projektmitglieder zugestimmt haben, und sie können
ersetzt werden, wenn die eigentliche Implementierung beginnt.

## Konventionen

- **Anforderungs-IDs** (`R1` …) sind in 01-goals.md definiert und werden überall sonst referenziert.
- **ADRs** folgen einer Kurzform von [MADR](https://adr.github.io/madr/): Kontext, Optionen,
  Entscheidung, Konsequenzen. Die Dateien sind nummeriert und werden nie gelöscht. Eine geänderte
  Entscheidung bekommt einen neuen ADR, der den alten ersetzt; so bleibt die Historie lesbar.
- **Sprache**: Dokumentation und schriftliche Arbeit sind auf Deutsch, Code, Kommentare und
  Commit-Nachrichten auf Englisch. Die Oberfläche ist deutsch; siehe
  [ADR 0001](decisions/0001-decision-records-and-language.md).
