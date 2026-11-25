# 0009: Historie als weiches Löschen, Bündel als ein Register

- Status: vorgeschlagen
- Datum: 2026-11-10
- Anforderungen: R8, R9

## Kontext

Gelöschte Einträge müssen wiederherstellbar sein. Bündel fügen mehrere Einträge auf einmal hinzu.
Beides soll offline funktionieren und synchronisiert werden, möglichst ohne neue Mechanismen.

## Entscheidung

**Historie.** Löschen setzt das Feld `deleted` des Eintrags auf `true`. Der Eintrag bleibt im
Datenbestand; die Historie ist die Menge der Einträge mit `deleted = true`, neueste zuerst.
Wiederherstellen setzt es zurück auf `false`. Wird der Name eines gelöschten Eintrags eingetippt,
wird dieser Eintrag wiederhergestellt statt ein zweiter angelegt, und die Historie speist die
Vorschläge des Eingabefelds.

**Bündel.** Ein Bündel ist eine Entität mit einem Feld `name` und einem Feld `items`, das
`[{ name, qty }, …]` als einen Wert enthält. Ein Bündel hinzuzufügen führt für jeden Eintrag die
normale Aktion „Eintrag hinzufügen“ aus. Im Prototyp wird ein Bündel aus den Einträgen angelegt,
die gerade auf der Liste stehen.

## Konsequenzen

- Der Tombstone, den die Replikation ohnehin braucht, ist die Historie; keine zweite Tabelle.
- Ein Historieneintrag pro Eintragsname, nicht einer pro Löschvorgang.
- Der Inhalt eines Bündels ist ein einziges Register: Bearbeiten zwei Personen dasselbe Bündel
  gleichzeitig, bleibt nur die spätere Version. Akzeptabel, da Bündel sich selten ändern.
- Bündel gehören zu einer Liste. Ein Bündel in einer anderen Liste wiederzuverwenden ist noch nicht möglich.
- Ein Bündel hinzuzufügen setzt Mengen, es addiert nicht zu vorhandenen.
