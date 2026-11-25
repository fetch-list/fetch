# 0001: Entscheidungen als ADRs festhalten; Dokumentation auf Deutsch, Code auf Englisch

- Status: vorgeschlagen
- Datum: 2026-11-10
- Anforderungen: Nachvollziehbarkeit in der Arbeit

## Kontext

Die Arbeit muss Entwurfsentscheidungen begründen. Gründe sind Monate später leicht vergessen, und
das Projekt ist zweisprachig: deutsche Hochschule und Arbeit, englisches technisches Umfeld.

## Optionen

1. Keine schriftliche Aufzeichnung; Gründe beim Schreiben der Arbeit rekonstruieren.
2. Ein wachsendes Entwurfsdokument.
3. Ein kurzer Architecture Decision Record pro Entscheidung, neben dem Code abgelegt.

Zur Sprache: alles Deutsch, alles Englisch oder aufgeteilt.

## Entscheidung

Option 3. Jeder ADR nennt Kontext, Optionen, Entscheidung und Konsequenzen sowie die
Anforderungen, denen er dient. ADRs werden nach der Annahme nicht mehr bearbeitet, außer ihrem
Status; eine geänderte Entscheidung bekommt einen neuen ADR.

Sprache aufgeteilt: Dokumentation (diese ADRs, README, `docs/`) und die schriftliche Arbeit sind
auf Deutsch, weil Hochschule, Betreuer und Arbeit deutsch sind und Textstellen so ohne Übersetzung
in die Arbeit übernommen werden können. Code, Kommentare und Commit-Nachrichten sind auf Englisch,
weil Bibliotheksdokumentation, Fehlermeldungen und Suchergebnisse englisch sind und gemischtsprachiger
Code schwerer zu lesen ist. Die Oberfläche ist deutsch, weil die Nutzer es sind.

## Konsequenzen

- Ein kleiner Aufwand pro Entscheidung, bezahlt, solange die Gründe noch bekannt sind.
- Die Git-Historie zeigt, wann und in welchem Commit jede Entscheidung getroffen wurde.
- Fachbegriffe ohne gängige deutsche Entsprechung (Service Worker, Last-Writer-Wins, Tombstone)
  bleiben englisch; Bezeichner im Code werden in der Doku unverändert zitiert.
