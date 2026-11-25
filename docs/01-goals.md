# Ziele und Anforderungen

## Kontext

Fetch! ist eine Studienarbeit (zwei Personen, zwei Semester): eine selbst gehostete
Einkaufslisten-Webanwendung. Anlass ist, dass bestehende Apps wie Bring! als umständlich und zu
eingeschränkt empfunden werden. Der technische Schwerpunkt der schriftlichen Arbeit (bis etwa
70 Seiten) liegt auf der **Offline-Nutzung (Caching) und der anschließenden Synchronisation, auch
zwischen mehreren Nutzern**.

## Anforderungen

Quelle: die Themenbeschreibung des Betreuers (README.md) und die Notizen der Projektmitglieder.
„Muss“-Punkte stammen aus der Beschreibung des Betreuers und sind zum Bestehen nötig.

| ID  | Anforderung | Priorität |
|-----|-------------|-----------|
| R1  | Webanwendung, die im Desktop-Browser und auf dem Smartphone gut funktioniert. Mindestens Firefox und Chromium. Keine native App. | muss |
| R2  | Die Anwendung lädt ohne Netzzugang (aggressives Caching der Anwendung selbst). | muss |
| R3  | Offline sind weiterhin Änderungen möglich; sie werden lokal im Browser gespeichert. | muss |
| R4  | Eine Strategie für Synchronisation und Konfliktauflösung, sobald die Verbindung zurück ist. | muss |
| R5  | Mehrere Listen pro Nutzer. | muss |
| R6  | Listen können mit anderen Personen geteilt werden. Notizen: Teilen per UUID genügt. | muss |
| R7  | Jeder Nutzer kann pro Liste eine individuelle Sortierung festlegen (z. B. je Ladenaufbau). Sie wird auf dem Server gespeichert und implizit per Drag & Drop geändert. | muss |
| R8  | Gelöschte Einträge bleiben in einer Historie und lassen sich leicht wieder auf die Liste setzen. | muss |
| R9  | Bündel: mehrere Einträge unter einem Namen, die auf einmal hinzugefügt werden (z. B. „Käsekuchen“ = 1 Eier, 2 Quark, 1 Milch). | muss |
| R10 | JSON-REST-API. | muss |
| R11 | Export der Daten als CSV. | muss |
| R12 | Läuft als Docker-Container, der sich auf jedem System leicht testen lässt. Eine Dokumentation dazu ist erforderlich. | muss |
| R13 | Der gesamte Code wird unter einer Open-Source-Lizenz veröffentlicht. | muss |
| R14 | Kleine, einfache Datenbank: SQLite, nicht PostgreSQL. | Notiz |
| R15 | Überwiegend HTML, CSS und JavaScript; Vanilla JS reicht vermutlich. | Notiz |
| R16 | Werkzeuge, die den Aufwand für CSS und Gestaltung verringern. | Notiz |
| R17 | Projektorganisation auf GitHub; der Betreuer legt dort Issues an. | Notiz |

## Nicht-Ziele

- Keine Funktionen über die Liste oben hinaus. Zusätzliche Funktionen machen das Projekt schwerer
  abzuschließen und zu beschreiben.
- Keine native App und keine App-Store-Anwendung.
- Keine Benutzerkonten mit Passwort, es sei denn, eine Anforderung erweist sich als darauf
  angewiesen (siehe Ergebnisse).

## Fragen an den Prototyp

Der Prototyp ist nicht das Produkt. Er soll diese Fragen mit Belegen beantworten:

- **F1** Lassen sich R2 und R3 in Firefox und Chromium allein mit Funktionen der Webplattform erfüllen?
- **F2** Gibt es eine Sync- und Konfliktstrategie (R4), die zwei Studierende umsetzen, testen und
  in einer Arbeit erklären können, ohne ein großes Sync-Framework zu übernehmen?
- **F3** Passen R7, R8 und R9 in dasselbe Sync-Modell, oder brauchen sie eigene Mechanismen?
- **F4** Wie klein kann der Stack sein (R14, R15), wenn R10 bis R12 trotzdem erfüllt werden?
- **F5** Was war schwerer als erwartet, und was sollte vor Beginn der eigentlichen Entwicklung
  entschieden werden?

Die Antworten stehen in [03-findings.md](03-findings.md).
