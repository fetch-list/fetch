# 0004: Service Worker mit Stale-while-revalidate für die App-Shell

- Status: vorgeschlagen
- Datum: 2026-11-10
- Anforderungen: R2

## Kontext

Die Seite muss sich auf einem Handy ohne Netzzugang öffnen. HTTP-Caching allein kann das nicht garantieren.

## Optionen

1. Nur HTTP-Cache-Header.
2. Service Worker, Cache first, versionierter Cache-Name.
3. Service Worker, Network first.
4. Service Worker, Stale-while-revalidate.

Siehe [02-research.md](../02-research.md), Abschnitt 1.

## Entscheidung

Option 4. Der Worker (`public/sw.js`) legt bei der Installation alle Shell-Dateien im Cache ab.
Jede Anfrage nach einer Shell-Datei wird sofort aus dem Cache beantwortet und im Hintergrund
aktualisiert. Anfragen an `/api/` bleiben unberührt: Listendaten liegen in IndexedDB (ADR 0005)
und werden von der Seite synchronisiert (ADR 0006).

Der Server sendet für statische Dateien `Cache-Control: no-cache`, damit der HTTP-Cache des
Browsers der Hintergrundaktualisierung des Workers keine veraltete Kopie liefern kann.

## Konsequenzen

- Der Start wartet nie auf das Netz; das zählt am meisten bei schwacher Verbindung im Laden.
- Eine neue Version erscheint nach einer Bereitstellung beim zweiten Laden, nicht beim ersten. Für
  einen Ladevorgang können Dateien einer Version mit der vorherigen gemischt sein. Ein strengeres
  Schema (Cache first, Cache-Name aus einem Build-Hash, Hinweis „Update verfügbar“) behebt beides,
  braucht aber eine gepflegte Versionsnummer.
- Service Worker brauchen einen sicheren Kontext. Über reines HTTP auf einer LAN-Adresse
  funktioniert die App nur online. Die Bereitstellungsdokumentation muss HTTPS abdecken.
- Keine Offline-Unterstützung in privaten Fenstern von Firefox.
- Die Background Sync API wird nicht verwendet, weil Firefox sie nicht hat; synchronisiert wird,
  solange die Seite offen ist.
