# 0008: Sortierprofile, die Eintragsnamen mit fraktionalen Positionen ordnen

- Status: vorgeschlagen
- Datum: 2026-11-10
- Anforderungen: R7

## Kontext

Nutzer kaufen in verschiedenen Läden mit verschiedenem Aufbau ein. Die Reihenfolge muss auf dem
Server gespeichert, individuell sein und sich implizit ändern, wenn Einträge gezogen werden.

## Optionen

Was trägt die Position: (a) die Eintragsinstanz, (b) der Eintragsname innerhalb eines Profils.
Wie wird sie gespeichert: ganzzahliger Index, ein Array pro Liste oder eine fraktionale Position
pro Eintrag. Siehe [02-research.md](../02-research.md), Abschnitt 5.

## Entscheidung

- Ein **Profil** ist eine benannte Entität einer Liste („Rewe Innenstadt“). Profile werden wie alles andere synchronisiert.
- Ein **Rang**-Register `(rank, "<profileId>|<normalisierter Name>", pos)` enthält eine Zahl.
- Einträge werden nach ihrem Rang im aktiven Profil sortiert angezeigt; Einträge ohne Rang folgen
  in der Reihenfolge, in der sie hinzugefügt wurden.
- Das Ziehen eines Eintrags schreibt einen Rang: den Mittelwert zwischen seinen neuen Nachbarn.
  Einträge ohne Rang oberhalb der Ablagestelle bekommen zuerst Ränge (`rankWrites()` in `core.js`).
- Welches Profil aktiv ist, wird pro Gerät gespeichert, nicht synchronisiert.
- Ziehen ohne ausgewähltes Profil legt eines an („Mein Markt“), damit niemand Profile verstehen
  muss, bevor er sortiert.
- Das Ziehen nutzt SortableJS (ADR 0010).

## Konsequenzen

- Ein Ladenaufbau wird einmal gelernt: Heute Milch löschen, nächste Woche hinzufügen, sie steht wieder an ihrem Platz.
- Ein Ziehen ist ein einziger kleiner Schreibvorgang, daher bleiben gleichzeitige Verschiebungen
  verschiedener Einträge beide erhalten.
- Positionen sind Gleitkommazahlen. Wiederholtes Einfügen an derselben Stelle halbiert jedes Mal
  den Abstand und erschöpft die Genauigkeit nach etwa 50 Mal. Fraktionale String-Schlüssel heben
  die Grenze auf und sind ein direkter Austausch von `rankWrites()`.
- Profile sind für alle auf der Liste sichtbar. In einem Haushalt ist das nützlich und entspricht
  vielleicht nicht einer strengen Lesart von „individuell pro Nutzer“ (siehe ADR 0007).
- Rang-Einträge für nicht mehr verwendete Namen bleiben in der Datenbank.
- Es gibt noch keine Tastatur-Alternative zum Ziehen.
