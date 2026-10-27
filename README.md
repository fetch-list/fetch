# Fetch!

## Beschreibung: 

Entwicklung einer self-hosted Einkaufslisten-Webapplikation

In dieser Arbeit soll eine Webapplikation entwickelt werden, die eine Einkaufsliste wiederspiegelt. Ähnliche Applikationen gibt es hundertfach (bspw die Android-App "Bring"), in dieser Arbeit ist allerdings die Implementierung gewisser Features für eine erfolgreiche Bearbeitung zwingend notwendig:

- Webapplikation die sowohl im Browser als auch auf einem Smartphone gut zu bedienen ist
- Garantierte Offlinefähigkeit: Möglichkeiten zum aggressiven Caching der Applikation ist erforderlich, damit sie auch im Browser des Smartphones ohne Internetzugriff lädt; bei Detektion des Offline-Zustands müssen Änderungen dennoch möglich sein und lokal im Browser gespeichert werden. Eine Strategie zur Synchronisation und Konfliktlösung ist erforderlich
- Multiuserfähigkeit, Multilistenfähigkeit: Teilen von Listen mit anderen Personen und Verwaltung mehrerer Listen
- Konfigurierbare Sortierung: Jeder Nutzer muss in der Lage sein, für eine gegebene Liste ein individuelles Sortierschema zu definieren. Dies soll ebenfalls serverseitig gespeichert werden und soll implizit (durch Drag & Drop von einzelnen Punkten) änderbar sein. Ein einfaches Beispiel ist ein Einkauf im Supermarkt, bei dem es gewisse Gegenstände in verschiedener Reihenfolge (je nach Markt-Layout) gibt. Je nachdem, wo eingekauft wird, ist diese Reihenfolge also profilabhängig anders.
- Historie gelöschter Items: Wenn ein Nutzer etwas löscht, soll dies historisiert werden und einfach auch wieder auf die Liste aufnehmbar sein.
- Erzeugung von Bundles: Zusammenfassung von mehreren Gegenständen zu einem "Bundle", das ebenfalls einfach hinzugefügt werden kann. Einfaches Beispiel: Bundle "Käsekuchen" selektiert automatisch "1 x Eier, 2 x Quark, 1 x Milch", etc.
- Grundsätzlich JSON REST API
- Export der Daten als CSV möglich


Die Applikation so zu entwickeln, dass sie als Docker-Container leicht auf jedem System getestet werden kann. Die Dokumentation hierzu ist dringend erforderlich. Sämtlicher Code ist unter einer Open Source Lizenz zu veröffentlichen.
