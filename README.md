# Tierarztpraxis Dr. Schäffer – Website

Moderne, barrierearme Website für die Tierarztpraxis Dr. Schäffer in Fürth.

## Projektstatus

Derzeit befindet sich das Projekt in der Planungs- und Bootstrap-Phase. Praxisdaten aus der alten Testseite wurden inventarisiert, aber noch nicht als produktiv bestätigt.

## Geplanter Stack

- Astro und TypeScript im Strict Mode
- modernes CSS ohne schweres UI-Framework
- GitHub Pages für die statische Website
- Cloudflare für DNS, Weiterleitungen, Sicherheitsheader, Turnstile und den Kontaktformular-Worker
- OpenStreetMap als datensparsame Zwei-Klick-Karte
- kein Java

## Geplante Adressen

- Website: `https://tierarztpraxis-schaffer.telacore.org`
- Weiterleitungsalias: `https://tierarztpraxisschaffer.telacore.org`
- Kontakt-API: `https://api.tierarztpraxis-schaffer.telacore.org`

Unterstriche werden nicht für öffentliche HTTPS-Hostnamen verwendet. Der Unterstrich im Repository-Namen ist unproblematisch.

## Dokumentation

- [Überarbeiteter Umsetzungsplan](docs/UMSETZUNGSPLAN.md)
- [Inventar der alten Testseite](docs/ALTSEITEN-INVENTAR.md)

Produktionsbuilds sollen bei fehlenden Pflichtwerten oder `TODO`-Platzhaltern fehlschlagen. Für lokale Entwicklung ist ein ausdrücklich gesetzter, nicht produktionsfähiger Entwicklungsschalter vorgesehen.
