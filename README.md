# Tierarztpraxis Dr. Schäffer – Website

Moderne, barrierebewusst entwickelte Website für die Tierarztpraxis Dr.
Schäffer in Fürth.

## Projektstatus

Das Projekt befindet sich in der Bootstrap- und Einrichtungsphase. Der
Architekturplan, die zentrale Datenstruktur für bestätigte Praxisangaben, ein
gesicherter Kontaktformular-Worker und der manuelle Cloudflare-Deploy-Workflow
liegen im Entwicklungsbranch vor.

Praxisdaten aus der alten Testseite bleiben bis zur Bestätigung als
`legacy-unverified` gekennzeichnet. Neu bestätigte Angaben zur Zugänglichkeit
sind in `docs/PRAXISDATEN.md` und `src/config/practice.ts` erfasst.

## Stack

- Astro und TypeScript im Strict Mode
- modernes CSS ohne schweres UI-Framework
- GitHub Pages für die statische Website
- Cloudflare für DNS, Weiterleitungen, Sicherheitsheader, Turnstile, Workers KV
  und den Kontaktformular-Worker
- Cloudflare Email Service für echte Testmails an eine verifizierte Zieladresse
- OpenStreetMap als direkt eingebettete Karte
- Vitest für Daten- und Worker-Tests
- kein Java

## Adressen

- GitHub-Projektseite:
  `https://h234598.github.io/tierarztpraxis_schaffer/`
- kanonische Website: `https://tierarztpraxis-schaffer.telacore.org`
- Weiterleitungsalias: `https://tierarztpraxisschaffer.telacore.org`
- Kontakt-API:
  `https://api.tierarztpraxis-schaffer.telacore.org/v1/contact`

Unterstriche werden nicht für öffentliche HTTPS-Hostnamen verwendet. Der
Unterstrich im Repository-Namen ist unproblematisch.

## Bestätigte Zugänglichkeitsangaben

- alle Praxisräume liegen im Erdgeschoss;
- am Eingang befindet sich eine kleine Türschwelle;
- die Eingangstür hat Standardbreite;
- ein Aufzug wird nicht benötigt;
- geeignete Parkplätze liegen unmittelbar vor der Praxis;
- das Team unterstützt Besucherinnen und Besucher jederzeit.

Die Website behauptet wegen der vorhandenen Schwelle nicht pauschal
„vollständig barrierefrei“, sondern beschreibt die Situation konkret.

## Dokumentation

- [Überarbeiteter Umsetzungsplan](docs/UMSETZUNGSPLAN.md)
- [Bestätigte und offene Praxisdaten](docs/PRAXISDATEN.md)
- [Cloudflare-Einrichtung: Schritte 4 bis 12](docs/CLOUDFLARE-SETUP.md)
- [Inventar der alten Testseite](docs/ALTSEITEN-INVENTAR.md)

## Kontaktformular-Worker

Der Worker enthält eine exakte Origin-Allowlist, Größen- und Feldvalidierung,
Honeypot, Mindest-Ausfüllzeit, Rate Limit, serverseitige Turnstile-Prüfung,
KV-basierte Empfängerauflösung und reinen Text-Mailversand.

In Entwicklung werden echte E-Mails ausschließlich an die serverseitig
festgelegte Testadresse versandt. Produktion fällt niemals auf diese
Testadresse zurück. Der Browser kann keinen Empfänger vorgeben.

## Produktionssperre

Produktionsbuilds sollen bei fehlenden Pflichtwerten oder `TODO`-Platzhaltern
fehlschlagen. Für Entwicklung ist ein ausdrücklich gesetzter Schalter mit
sichtbaren Hinweisen und `noindex,nofollow` vorgesehen.
