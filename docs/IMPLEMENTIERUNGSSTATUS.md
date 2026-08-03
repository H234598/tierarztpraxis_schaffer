---
tags:
  - projekt/tierarztpraxis-schaffer
  - status/implementierung
  - github-pages
  - cloudflare-workers
type: implementation-status
status: in-progress
updates: 2026-08-03
updated: 2026-08-03
date: 2026-08-03
aliases:
  - Tierarztpraxis-Webseite Implementierungsstatus
created: 2026-08-03
title: Implementierungsstatus – Tierarztpraxis Dr. Schäffer
---

# Implementierungsstatus – Tierarztpraxis Dr. Schäffer

## Meilenstein 1: Auslieferbare Entwicklungsversion

Der zuvor separat bereitgestellte Cloudflare-Worker ist nun mit einer vollständigen statischen Astro-Website verbunden.

### Umgesetzt

- moderne responsive Startseite;
- prominente Telefonnummer in Header, Hero, Notfall- und Kontaktbereichen;
- Seiten für Leistungen, Praxis, Sprechzeiten, Notfall, Kontakt, FAQ, Stellenangebote, Barrierefreiheit, Impressum und Datenschutz;
- direkte OpenStreetMap-Karte mit den bestätigten Koordinaten;
- Kontaktformular gegen `api.tierarztpraxis-schaffer.telacore.org`;
- Honeypot, Mindest-Ausfüllzeit und Cloudflare Turnstile im Frontend;
- verständliche Erfolgs- und Fehlermeldungen;
- keine Datei-Uploads;
- Entwicklungsbanner und `noindex,nofollow`;
- gehärtete CI mit `--frozen-lockfile`;
- GitHub-Pages-Deployment aus `main`;
- Sitemap, Canonicals, 404-Seite, Manifest und Favicon;
- Tastaturfokus, Skip-Link, native FAQ-Aufklapper und reduzierte Bewegung.

## Bewusst offene Produktionsblocker

- behandelte Tierarten;
- vollständiges Leistungsangebot;
- Notdienst außerhalb der Sprechzeiten;
- öffentliche Praxis-E-Mail;
- Team, Qualifikationen und Praxisfotos;
- genaue Tür- und Schwellenmaße;
- Angaben zu Praxis-WC, Bewegungsflächen und ÖPNV;
- vollständige berufsrechtliche Angaben;
- juristische Freigabe von Impressum und Datenschutz;
- echtes Produktions-Turnstile-Widget;
- abschließende Barrierefreiheitstests.

## Betriebsmodus

Bis zur Freigabe bleibt die öffentliche Website technisch eine Entwicklungsversion:

```text
SITE_DEPLOYMENT_MODE=development
ALLOW_PLACEHOLDERS=true
robots=noindex,nofollow
```

Das Kontaktformular versendet dabei echte Nachrichten ausschließlich an das serverseitig konfigurierte Testpostfach.

## Nächster Meilenstein

1. CI und Pages-Deployment des neuen Branches vollständig grün bekommen.
2. Kontaktformular als End-to-End-Test über die veröffentlichte Website prüfen.
3. Fehlende fachliche und rechtliche Praxisdaten strukturiert einsammeln.
4. Barrierefreiheit mit Tastatur, Zoom, Screenreader und axe prüfen.
5. Erst danach auf Produktionsmodus und echtes Turnstile-Widget umstellen.
