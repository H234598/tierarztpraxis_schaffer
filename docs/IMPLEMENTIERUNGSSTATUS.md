---
tags:
  - projekt/tierarztpraxis-schaffer
  - status/implementierung
  - github-pages
  - cloudflare-workers
type: implementation-status
status: in-progress
updates: 2026-08-11
updated: 2026-08-11
date: 2026-08-03
aliases:
  - Tierarztpraxis-Webseite Implementierungsstatus
created: 2026-08-03
title: Implementierungsstatus – Tierarztpraxis Dr. Schäffer
---

# Implementierungsstatus – Tierarztpraxis Dr. Schäffer

## Meilenstein 1: Auslieferbare Entwicklungsversion

Der zuvor separat bereitgestellte Cloudflare-Worker ist nun mit einer vollständigen
statischen Astro-Website verbunden.

### Umgesetzt

- moderne responsive Startseite;
- prominente Telefonnummer in Header, Hero, Notfall- und Kontaktbereichen;
- Seiten für Leistungen, Praxis, Sprechzeiten, Notfall, Kontakt, FAQ, Stellenangebote,
  Barrierefreiheit, Impressum und Datenschutz;
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
- vier statische Startseitenvarianten mit `/` als Variante 4 und geschützter
  Varianten-/TODO-Navigation;
- öffentliche TODO-Übersicht mit synchronisiertem Registry-Generator und
  `noindex,nofollow`;
- Datentransfer-Arbeitsfassung mit Token-/Session-/CSRF-Schutz, Admin-Fallansicht,
  Antworten, Benachrichtigungsqueue und Wartungslauf;
- lokale Build-Inspektoren für Home-, Kontakt- und Datentransfer-Artefakte.

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

Das Kontaktformular versendet dabei echte Nachrichten ausschließlich an das serverseitig
konfigurierte Testpostfach.

## Datentransfer- und Development-Stand 2026-08-11

Die lokale Implementierung bis einschließlich des vollständigen Test- und
Sicherheitsgates ist abgeschlossen: 81 Website-Tests, 272 Worker-Tests, 1 Runtime-Test
und 97 von 101 Playwright-Tests bestehen; 4 Root-/Host-Prüfungen auf Tablet/Mobile sind
designbedingt übersprungen. Astro Check, Formatprüfung, Build-Inspektoren, Budgets und
Worker-Dry-Run sind grün.

Gegen Cloudflare geprüft:

- Development-D1 `tierarztpraxis-schaffer-transfer-development` existiert in
  EU-Jurisdiktion; die freigegebene Remote-Migration `0001_datatransfer.sql` wurde am
  11.08.2026 mit 17 SQL-Kommandos angewendet, es stehen keine Migrationen aus und die
  direkte Schemaabfrage bestätigt die neun Datentransfer-Tabellen in `EEUR`; der
  read-only `foreign_key_check` blieb ohne Befund und alle neun Transfer-Tabellen sind
  derzeit leer;
- Hauptqueue und Dead-Letter-Queue existieren; die Development-Worker-Version
  `fc3b44df-bb8c-462b-9b4b-f98db6ebce6b` ist deployed und als Producer/Consumer an die
  Hauptqueue gebunden; der Healthcheck antwortet mit HTTP 200;
- der Development-Secret-Status enthält alle sechs Namen `RATE_LIMIT_SALT`,
  `TURNSTILE_SECRET`, `TOKEN_PEPPER`, `SESSION_PEPPER`, `ACCESS_TEAM_DOMAIN` und
  `ACCESS_ADMIN_API_AUD`; Werte werden nicht dokumentiert;
- die beiden Development-Access-Anwendungen für `/admin/*` und `/api/admin/*` sind mit
  expliziter Admin-E-Mail-Policy, OTP-Organisation und vier Stunden Sessiondauer aktiv;
- der private R2-Development-Bucket `tierarztpraxis-schaffer-transfer-development`
  existiert in EU mit Standard Storage Class, leerem Bestand, deaktiviertem `r2.dev`,
  ohne Custom Domain und aktiver 60-Tage-Regel `expiry-60-days`;
- der aktuelle `wrangler deploy --dry-run --env development` bündelt 90,38 KiB und löst
  KV, Email Service, Queue, D1, R2 und Rate Limiter sowie die Development-Variablen
  korrekt auf; der anschließende Development-Deploy ist separat verifiziert;
- die isolierte D1-Time-Travel-Restoreübung wurde mit anonymisierten Daten bestanden:
  alle neun Tabellen enthielten nach dem Restore je eine Stichprobe, der
  `foreign_key_check` blieb leer und die nach dem Bookmark eingeführte Mutation wurde
  zurückgesetzt. Die isolierte Datenbank wurde gelöscht; die produktive Development-
  Datenbank und alle Produktionswerte blieben unverändert.

Die Produktionsvalidierung bleibt absichtlich geschlossen, solange Platzhalter,
fachliche TODOs und rechtliche Produktionsblocker offen sind. Kontakt- und
Datentransfer-Formular sind in Produktion zusätzlich standardmäßig deaktiviert und
werden erst nach ausdrücklicher Freigabe per Deployment-Variable aktiviert.

## Nächster Meilenstein

1. Die vollständige Access-OTP-Remote-E2E mit anonymisierten Testdaten abnehmen.
2. Access, Turnstile und Mailzustellung in Development abnehmen.
3. Fehlende fachliche und rechtliche Praxisdaten strukturiert einsammeln und freigeben.
4. Erst danach auf Produktionsmodus und echtes Turnstile-Widget umstellen.
