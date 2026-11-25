# 0007: Listen werden über ihre UUID geteilt; keine Benutzerkonten

- Status: vorgeschlagen
- Datum: 2026-11-10
- Anforderungen: R5, R6

## Kontext

Listen müssen teilbar sein. Die Notizen schlagen das Teilen per UUID vor. Konten würden
Registrierung, Passwortbehandlung und Sessions mit sich bringen.

## Optionen

1. Konten mit Passwort und Berechtigungen pro Liste.
2. Die Listen-ID ist eine zufällige UUID und dient als Schlüssel: Wer sie kennt, kann lesen und schreiben.

## Entscheidung

Option 2. Eine Liste wird auf dem Client angelegt (auch offline), indem eine UUID (122 Zufallsbits)
erzeugt und ihr erstes Register geschrieben wird. Der Teilen-Link ist `https://host/#<uuid>`. Die
ID steht im Fragment der URL, das Browser weder mit der Seitenanfrage noch im `Referer`-Header an
den Server senden. Jedes Gerät merkt sich, welche Listen es kennt.

## Konsequenzen

- Kein Login, und das Anlegen einer Liste funktioniert offline.
- Einer einzelnen Person lässt sich der Zugriff nicht entziehen, und Leser lassen sich nicht von
  Schreibern unterscheiden.
- „Meine Listen“ gibt es pro Gerät. Ein zweites Gerät braucht jeden Link erneut. Die Notizen
  erwähnen, mehrere Listen unter einer UUID zu gruppieren; eine synchronisierte Entität
  „Sammlung“ würde das leisten und passt ins Registermodell.
- Wer den Server erreicht, kann Listen anlegen. Eine öffentliche Instanz braucht mindestens Rate
  Limiting oder ein instanzweites Passwort. Mit dem Betreuer klären, wie weit das gehen muss.
- R7 sagt „jeder Nutzer“. Ohne Konten wird „Nutzer“ durch benannte Sortierprofile und eine Auswahl
  pro Gerät angenähert (ADR 0008). Bestätigen lassen, dass diese Lesart akzeptabel ist.
