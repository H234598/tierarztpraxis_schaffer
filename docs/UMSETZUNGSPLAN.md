---
tags:
  - projekt/tierarztpraxis-schaffer
  - plan/implementierung
  - astro
  - typescript
  - github-pages
  - cloudflare-workers
  - cloudflare-d1
  - cloudflare-r2
  - cloudflare-access
  - cloudflare-queues
  - datentransfer
  - barrierefreiheit
  - sicherheit
  - datenschutz
  - design
type: implementation-plan
status: ready-for-execution
updates: 2026-08-04
date: 2026-08-04
aliases:
  - Tierarztpraxis Website Masterplan
  - Vier Startseiten und Datentransfer
  - Tierarztpraxis Schäffer Meilensteinplan
created: 2026-08-04
title: Tierarztpraxis Dr. Schäffer – Master-Implementierungsplan für vier Startseiten, TODO-Seite und sicheren Datentransfer
---

# Tierarztpraxis Dr. Schäffer – Master-Implementierungsplan für vier Startseiten, TODO-Seite und sicheren Datentransfer

> [!important] Für agentische Umsetzung
> **Erforderlicher Arbeitsmodus:** Diesen Plan taskweise mit einem isolierten Git-Worktree und überprüfbaren Zwischenständen ausführen. Jeder Task endet mit Tests, Review und einem eigenständig verständlichen Commit. Für die Umsetzung ist ein subagentengesteuerter oder explizit checkpointbasierter Ablauf vorgesehen; keine ungeprüften Großcommits.
>
> **Planmodus:** Dieses Dokument beschreibt ausschließlich die Umsetzung. Es nimmt selbst keine Produktivänderung vor.

**Ziel:** Die bestehende, bereits auslieferbare Astro-Website wird zu einer eleganten, modernen und lebendig formulierten Praxiswebsite mit vier auswählbaren Startseitenvarianten erweitert. Gleichzeitig entsteht ein gehärtetes Datentransfer-MVP, über das die Praxis fallbezogene Zugriffstokens erzeugt und Tierhalter Berichte, Bilder, Videos und HTTPS-Links vertraulich übermitteln können. Eine zentrale Unterseite `TODO` macht alle noch offenen Daten, Entscheidungen, Prüfungen und Produktionsblocker transparent.

**Architektur:** Die öffentliche Website bleibt statisch auf GitHub Pages. Cloudflare bleibt Edge-, DNS- und API-Schicht. Das vorhandene Worker-Backend wird modularisiert und um D1, einen privaten R2-Bucket, Queues sowie Cloudflare Access für die Adminfunktionen erweitert. Die vier Startseiten teilen ein gemeinsames Inhaltsmodell und unterscheiden sich nur in Komposition, Design-Tokens und Bildsprache; die dritte neu generierte Preview wird als vierte Gesamtvariante und Standard-Landingpage auf `/` umgesetzt.

**Tech Stack:** Astro 7, TypeScript Strict Mode, modernes CSS ohne UI-Runtime-Framework, pnpm mit Lockfile, GitHub Pages, GitHub Actions, Cloudflare Workers, Workers KV, D1, R2, Queues, Access, Turnstile, Email Service, OpenStreetMap, Vitest, Cloudflare Workers Vitest Integration, Playwright und axe-core. **Kein Java.**

---

## 1. Global verbindliche Leitplanken

- Repository: `H234598/tierarztpraxis_schaffer`.
- Standardbranch: `main`.
- Kanonische Website: `https://tierarztpraxis-schaffer.telacore.org`.
- Alias: `https://tierarztpraxisschaffer.telacore.org`.
- Bestehende Kontakt-API: `https://api.tierarztpraxis-schaffer.telacore.org/v1/contact`.
- Öffentliche Datentransferseite: `https://tierarztpraxis-schaffer.telacore.org/datentransfer/`.
- Adminseite: `https://tierarztpraxis-schaffer.telacore.org/admin/datentransfer/`.
- Neue same-origin API-Routen: `https://tierarztpraxis-schaffer.telacore.org/api/...`, über einen Cloudflare-Worker-Route-Match vor GitHub Pages.
- Das bestehende Kontaktformular bleibt funktionsfähig und wird beim Worker-Refactoring durch Regressionstests geschützt.
- Der E-Mailversand des bestehenden Kontaktformulars ist nach Nutzerbestätigung funktionsfähig.
- Die dritte der drei neu generierten Previews wird zur **Startseite 4** und zum Standard auf `/`.
- Die bisherige Startseite bleibt **Startseite 1**.
- Keine extern geladenen Webfonts.
- Keine Analyse- oder Werbetracker.
- Keine Java-Komponenten.
- Keine erfundenen medizinischen Leistungen, Teammitglieder, Qualifikationen oder Rechtsangaben.
- Generierte Bilder mit Menschen sind niemals als echtes Team oder echte Praxisfotografie auszugeben; sie werden als `Symbolbild` gekennzeichnet oder nur als Designreferenz verwendet.
- Die TODO-Seite darf niemals Secrets, Tokenwerte, private E-Mail-Adressen außer ausdrücklich freigegebenen Testadressen, Cloudflare-IDs mit Sicherheitswirkung oder interne personenbezogene Angaben veröffentlichen.
- Das Datentransferportal ist kein Notfallkanal und darf keine automatische Diagnose, Triage oder Behandlungszusage vornehmen.
- R2 und D1 werden für den Datentransfer von Anfang an mit EU-Jurisdiktion erstellt. Die Jurisdiktion kann nach Erstellung nicht nachträglich geändert werden.
- Der R2-Bucket bleibt privat. Kein `r2.dev`, keine öffentliche Bucket-Domain.
- Kundentokens werden nie im Klartext gespeichert.
- Kundentokens werden nicht als Query-Parameter oder URL-Pfad transportiert, sondern als URL-Fragment oder manuelle Eingabe.
- E-Mails enthalten keine Berichte, Bilder, Videos oder Berichtstexte, sondern nur minimale Benachrichtigungen und einen Link zum Access-geschützten Adminbereich.
- Die Praxis muss vor produktiver Freigabe entscheiden und dokumentieren, wann übermittelte Inhalte in die offizielle Praxis-/Patientenakte übernommen und wann Portal-Kopien gelöscht werden.
- Der gesamte Ausbau bleibt zunächst im Entwicklungsmodus und `noindex`, bis sämtliche Produktionsblocker geschlossen sind.

---

## 2. Evidenzbasierter Ausgangsstand des Repositorys

### 2.1 Bereits vorhanden

Das Repository enthält aktuell:

- Astro 7 mit TypeScript im Strict Mode;
- eine statische GitHub-Pages-Website;
- Seiten für Start, Leistungen, Praxis, Sprechzeiten, Notfall, Kontakt, FAQ, Stellenangebote, Barrierefreiheit, Impressum, Datenschutz und 404;
- prominente Telefonnummer;
- direkte OpenStreetMap-Einbettung;
- ein funktionierendes Kontaktformular;
- Cloudflare Turnstile;
- Honeypot und Mindest-Ausfüllzeit;
- einen gehärteten Kontaktformular-Worker;
- serverseitige Empfängerauflösung über Workers KV;
- Cloudflare Email Service;
- pnpm-Lockfile und gehärtete CI;
- eine CSP ohne `unsafe-inline`;
- einen Build-Artefakt-Test, der verhindert, dass Astro den Formularhandler erneut inline ausliefert;
- bestätigte Angaben zur baulichen Zugänglichkeit;
- sichtbare Entwicklungskennzeichnung und `noindex,nofollow`.

### 2.2 Aktuelle technische Engstellen

- `src/pages/index.astro` ist derzeit eine einzelne, relativ schlichte Startseite.
- `src/components/Header.astro` besitzt noch kein Startseiten-Dropdown.
- `src/styles/global.css` ist monolithisch und für vier deutlich unterschiedliche visuelle Varianten nicht ausreichend modular.
- `src/config/site.ts` mischt bestätigte Fakten, unbestätigte Inhalte und sichtbare Platzhalter.
- `scripts/validate-content.ts` erkennt textuelle Platzhalter, aber es gibt noch kein strukturiertes, öffentlich renderbares TODO-Register.
- `worker/src/index.ts` ist monolithisch und für Kontaktformular, Datentransfer, Uploads, Adminzugriff, Queue-Consumer und Cron-Aufgaben zu groß.
- D1, R2, Queues und Access sind für den Datentransfer noch nicht eingerichtet.
- Es existiert noch keine sichere Token-, Session-, Upload-, Thread- oder Antwortlogik.
- Die drei generierten Designbilder sind derzeit Designvorschauen, keine implementierten Startseiten.

---

## 3. Historische Ziele und Meilensteine aus diesem Projektchat

| ID | Zeitraum | Ziel oder Entscheidung | Status | Evidenz |
|---|---|---|---|---|
| H0 | 2026-07-15 | Moderne Website für die Tierarztpraxis auf GitHub Pages; Cloudflare Free Tier darf ergänzen. | abgeschlossen | Grundarchitektur definiert |
| H1 | 2026-07-15 bis 2026-08-03 | Repository in `tierarztpraxis_schaffer` umbenennen; Altseiten-ZIP inventarisieren; relevante Daten, Texte, Farben und Bilder übernehmen; Joomla/MHTML nicht migrieren. | abgeschlossen | PR #1 |
| H2 | 2026-07-15 | FAQ und Stellenangebote werden verpflichtende Seiten; Telefonnummer prominent; OSM integrieren; fehlende Angaben als kontrollierte Platzhalter. | abgeschlossen | PR #1 und PR #2 |
| H3 | 2026-07-16 | Kanonische Domain mit Bindestrich; Alias ohne Bindestrich; API auf eigener Subdomain; GitHub-Pages-Custom-Domain repositorybezogen konfigurieren. | abgeschlossen | DNS-/Pages-Konzept |
| H4 | 2026-07-16 | OpenStreetMap direkt anzeigen; Koordinaten `49.483750, 10.9705833333`. | abgeschlossen | Kontaktseite |
| H5 | 2026-07-16 | Empfängeradresse ohne Worker-Codeänderung austauschbar; Workers KV statt Durable Object für selten geänderte Konfiguration. | abgeschlossen | Worker/KV |
| H6 | 2026-07-16 | Entwicklungsmodus darf echte E-Mails nur an `tierarztpraxis_schaffer@herr-der-mails.de` senden. | abgeschlossen | Worker deployed, Nutzer bestätigt Versand |
| H7 | 2026-07-16 | Produktionsbuild muss bei fehlenden Pflichtwerten scheitern; Entwicklungsmodus darf markierte Platzhalter ausliefern. | abgeschlossen | Validator und Workflows |
| H8 | 2026-07-16 | Bauliche Zugänglichkeit konkret beschreiben: Erdgeschoss, kleine Türschwelle, Standardtür, kein Aufzug, Parkplätze vor der Tür, Unterstützung jederzeit. | abgeschlossen | Praxisdaten und FAQ |
| H9 | 2026-08-03 | Worker deployen und CI mit Lockfile, Frozen Install und minimalen Rechten härten. | abgeschlossen | PR #1/Worker-Workflow |
| H10 | 2026-08-03 | Vollständige Entwicklungsversion der Website mit Kontaktformular, OSM, FAQ, Jobs und Rechtsseiten veröffentlichen. | abgeschlossen | PR #2 |
| H11 | 2026-08-03 | Echtes Turnstile-Schlüsselpaar erzwingen, Dummy-Fallback entfernen und Fehlermeldungen präzisieren. | abgeschlossen | PR #3 |
| H12 | 2026-08-03 | CSP-bedingt blockierten Inline-Formularhandler diagnostizieren; als externes Asset ausgeben; Artefaktregressionstest ergänzen. | abgeschlossen | PR #4 |
| H13 | 2026-08-04 | Optik eleganter, hübscher und moderner gestalten; Texte lebendiger machen; mehrere Designrichtungen erstellen. | geplant in diesem Dokument | Startseiten 2–4 |
| H14 | 2026-08-04 | Alle drei neuen Designs plus bestehende Seite auswählbar machen; Standard ist die dritte neue Preview. | geplant in diesem Dokument | Startseiten 1–4 |
| H15 | 2026-08-04 | Neue Seite `TODO` mit allen offenen Daten, Entscheidungen, Aufgaben und Produktionsblockern. | geplant in diesem Dokument | strukturierte TODO-Registry |
| H16 | 2026-08-04 | Tokenbasierter Datentransfer für Berichte, Bilder, Videos und Links; optionaler Praxisantwort-Thread. | geplant in diesem Dokument | Datentransfer-MVP |

---

## 4. Meilensteinstruktur ab jetzt

### Meilenstein 2A – Designsystem, vier Startseiten und lebendigere Inhalte

**Ergebnis:**

- vier vollständig implementierte Startseiten;
- Startseiten-Dropdown unter `Start`;
- Startseite 4 als Landingpage auf `/`;
- responsives, elegantes Designsystem;
- neue Bildassets mit sauberer Provenienz;
- lebendigere, aber fachlich nicht erfindende Texte;
- Varianten-SEO und Barrierefreiheit;
- visuelle Regressionstests.

### Meilenstein 2B – Strukturierte TODO-Unterseite und einheitliche Datenquelle

**Ergebnis:**

- `/todo/` mit Filtern, Status, Prioritäten und Produktionsblockern;
- maschinenlesbare TODO-Registry;
- automatisch generiertes `docs/TODO.md`;
- Validator und TODO-Seite verwenden dieselbe Quelle;
- erledigte historische Meilensteine werden sichtbar dokumentiert;
- keine Secrets auf der öffentlichen Seite.

### Meilenstein 2C – Sicherer Datentransfer-MVP

**Ergebnis:**

- Admin erzeugt fallbezogene Tokens;
- Tierhalter kann Bericht, Bilder, Videos und HTTPS-Links übertragen;
- Dateien liegen privat in R2;
- Metadaten und Thread liegen in D1;
- Token, Session, CSRF, Turnstile und Quoten sind gehärtet;
- Praxis erhält minimale Benachrichtigung;
- Access-geschütztes Admin-Dashboard;
- optionaler Antworttext und Status `Rückruf geplant`;
- automatisierte Lösch- und Aufbewahrungslogik;
- vollständige lokale und Remote-E2E-Prüfung.

### Meilenstein 3 – Produktionsfreigabe

Nicht Teil des unmittelbaren Entwicklungsmeilensteins, aber im Plan enthalten:

- vollständige Praxisdaten;
- rechtliche Freigabe;
- Auftragsverarbeitung und Verzeichnis der Verarbeitungstätigkeiten;
- endgültige Aufbewahrungsentscheidung;
- Barrierefreiheitsprüfung;
- Produktions-Turnstile;
- produktiver Datentransfer;
- Produktionsmodus ohne offene Blocker.

---

## 5. Verbindliche Zuordnung der Startseiten

Die Benennung wird eindeutig festgelegt:

| Menülabel | Ursprung | Route | Indexierung | Rolle |
|---|---|---|---|---|
| Startseite 1 | bisherige aktuelle Startseite | `/startseiten/1/` | `noindex,follow` | konservative Bestandsvariante |
| Startseite 2 | erste neu generierte Preview | `/startseiten/2/` | `noindex,follow` | premium-klinisch, Grün/Teal/Beige |
| Startseite 3 | zweite neu generierte Preview | `/startseiten/3/` | `noindex,follow` | editorial, Creme/Oliv, ruhige Typografie |
| Startseite 4 | dritte neu generierte Preview | `/startseiten/4/` | `noindex,follow` | modern, Teal/Koralle, Standard |
| Standard | identischer Renderer wie Startseite 4 | `/` | `index` erst nach Produktionsfreigabe | Landingpage |

> [!note]
> Die Formulierung „die dritte Preview ist Standard“ bedeutet damit: Die bisherige Seite zählt als Startseite 1; die drei neuen Previews werden Startseiten 2, 3 und 4. Die dritte neue Preview ist folglich Startseite 4.

---

## 6. Zielarchitektur

### 6.1 Öffentliche Website

```text
Browser
  │
  ├── /                       → HomeVariant 4
  ├── /startseiten/1/         → HomeVariant 1
  ├── /startseiten/2/         → HomeVariant 2
  ├── /startseiten/3/         → HomeVariant 3
  ├── /startseiten/4/         → HomeVariant 4
  ├── /todo/                  → strukturierte, nicht geheime Projekt-TODOs
  ├── /datentransfer/         → öffentlicher Token- und Upload-Client
  ├── /admin/datentransfer/   → statische Admin-Shell, Cloudflare Access davor
  └── bestehende Inhaltsseiten
          │
          └── GitHub Pages
```

### 6.2 API-Routing

```text
tierarztpraxis-schaffer.telacore.org/api/*
                 │
                 └── Cloudflare Worker Route
                        ├── /api/transfers/*
                        └── /api/admin/*

api.tierarztpraxis-schaffer.telacore.org/*
                 │
                 └── vorhandene Worker Custom Domain
                        ├── /v1/contact
                        └── /health
```

Der neue Datentransfer wird same-origin unter `/api/` bereitgestellt. Dadurch entfallen Cross-Origin-Cookies und ein großer Teil der CORS-Komplexität. Das bestehende Kontaktformular bleibt vorerst auf der bereits funktionierenden `api.`-Adresse.

### 6.3 Datentransfer

```text
Tierhalter
  │
  ├── öffnet /datentransfer/#token=dt1_...
  ├── Token wird per POST gegen Session getauscht
  ├── URL-Fragment wird sofort entfernt
  ├── erhält HttpOnly-Sessioncookie + CSRF-Token
  ├── erstellt Bericht und Upload-Slots
  ├── streamt einzelne Dateien über Worker in R2
  └── sieht Thread und optionale Praxisantwort

Cloudflare Worker
  │
  ├── Turnstile
  ├── Token-HMAC-Prüfung
  ├── Session- und CSRF-Prüfung
  ├── D1-Metadaten
  ├── R2-Dateien
  ├── Queue-Benachrichtigung
  └── minimale Audit-Events

Praxisadmin
  │
  ├── /admin/datentransfer/
  ├── Cloudflare Access OTP / IdP
  ├── Worker validiert Cf-Access-Jwt-Assertion
  ├── erzeugt Token
  ├── liest Bericht und Dateien
  ├── antwortet optional oder markiert Rückruf
  └── markiert Übernahme in Praxisakte und schließt Fall
```

---

## 7. Free-Tier-Budget und technische Grenzwerte

### 7.1 Aktuelle Plattformgrenzen, Stand 2026-08-04

| Produkt | Free-Tier-Rahmen | Architekturfolge |
|---|---|---|
| Workers | 100.000 Requests/Tag, 10 ms CPU pro HTTP-Request, 128 MB RAM, 100 MB Request-Body im Free-Zonentarif | Uploads streamen, keine große Datei puffern, keine Videotranscodierung |
| R2 Standard | 10 GB-Monat Speicher, 1 Mio. Class-A- und 10 Mio. Class-B-Operationen/Monat, keine Egresskosten | private Kurzzeitablage ist realistisch; Speicherquote hart begrenzen |
| D1 Free | 5 Mio. gelesene Zeilen/Tag, 100.000 geschriebene Zeilen/Tag, 5 GB Gesamtspeicher; einzelne Free-Datenbank maximal 500 MB; 7 Tage Time Travel | Indizes, kleine Metadaten, keine Binärdateien in D1 |
| Queues Free | 10.000 Operationen/Tag, 24 Stunden Retention | nur IDs in Nachrichten; Cron-Reconciliation gegen stille Ausfälle |
| Access Free | bis 50 Nutzer im Free-Paket | ausreichend für Praxisadmin und wenige Mitarbeitende |
| Worker Static Assets | 20.000 Dateien, 25 MiB pro Datei | Admin-Shell wäre möglich; im Plan bleibt die Shell auf GitHub Pages und die Daten bleiben API-geschützt |

### 7.2 Projektinterne Quoten

Diese Werte sind absichtlich deutlich kleiner als die Plattformmaxima:

```ts
export const transferLimits = {
  tokenDefaultLifetimeDays: 14,
  tokenMaximumLifetimeDays: 30,
  sessionLifetimeMinutes: 30,
  sessionAbsoluteLifetimeHours: 12,
  maximumSubmissionsPerCase: 5,
  maximumFilesPerSubmission: 8,
  maximumLinksPerSubmission: 8,
  maximumImageBytes: 12 * 1024 * 1024,
  maximumVideoBytes: 50 * 1024 * 1024,
  maximumFileBytes: 50 * 1024 * 1024,
  maximumCaseBytes: 100 * 1024 * 1024,
  warningBucketBytes: 7 * 1024 * 1024 * 1024,
  hardBucketBytes: 8 * 1024 * 1024 * 1024,
  defaultDeleteAfterCloseDays: 30,
  absoluteLifecycleBackstopDays: 60,
} as const;
```

### 7.3 Upgrade- oder Architekturtrigger

Ein Upgrade oder eine bewusste Funktionsbegrenzung wird ausgelöst, wenn eines der folgenden Kriterien erreicht wird:

- R2-Nutzung über 7 GB;
- tägliche Worker-Requests über 50.000;
- p95-CPU-Zeit über 8 ms;
- D1-Zeilenschreibvorgänge über 80.000/Tag;
- Queue-Nachrichten werden wiederholt älter als 60 Minuten;
- mehr als 25 aktive Datentransferfälle gleichzeitig;
- Videos über 50 MB werden regelmäßig benötigt;
- die Funktion wird für die Praxis betriebskritisch und benötigt SLA oder Support;
- eine rechtliche oder technische Risikobewertung verlangt Malware-Scanning, stärkere Verschlüsselung oder längere revisionssichere Aufbewahrung.

---

## 8. Datenschutz- und Sicherheitsgrundsätze

### 8.1 Einordnung

Die Plattform verarbeitet personenbezogene Daten der Tierhalter und vertrauliche fallbezogene Tierinformationen. Tiergesundheitsdaten sind nicht automatisch menschliche Gesundheitsdaten im Sinne der besonderen Kategorien, können aber mit Namen, Kontaktangaben, Wohnumfeld, Bildmaterial und freien Texten verknüpft sein. Die Verarbeitung wird deshalb wie ein hochvertraulicher Intake-Kanal behandelt.

Vor Produktion sind mindestens zu dokumentieren:

- Verantwortlicher;
- Verarbeitungszweck;
- Rechtsgrundlage;
- Pflicht- und freiwillige Felder;
- Auftragsverarbeiter;
- Drittland-/Transferprüfung;
- Aufbewahrungs- und Löschregeln;
- Betroffenenrechte;
- Datenpannenprozess;
- technische und organisatorische Maßnahmen;
- Übergabe in die offizielle Praxisakte;
- Umgang mit Rückruf statt digitaler Antwort.

### 8.2 Privacy by Design

- Datenminimierung: nur fallbezogene Angaben erheben.
- Keine automatische Auswertung oder Diagnose.
- Keine Berichtsinhalte in E-Mails.
- Keine Tokens in URLs, Serverlogs oder Analytics.
- Keine öffentlichen R2-Objekte.
- Keine Dateinamen als R2-Key.
- Keine IP-Adressen in D1 oder Anwendungslogs.
- Keine Browserfingerprints.
- Keine externen Vorschau- oder Link-Metadatenabrufe.
- Keine Social-Media- oder Analyse-Skripte auf Datentransfer- und Adminseiten.
- `Cache-Control: no-store` für alle Transfer-API-Antworten.
- `Referrer-Policy: no-referrer` auf `/datentransfer/` und `/admin/datentransfer/`.
- EU-Jurisdiktion für D1 und R2.
- R2-Lifecycle als Lösch-Backstop.
- D1-Reconciliation und nachvollziehbare Lösch-Audit-Events.

### 8.3 Sicherheitsbedrohungen und Gegenmaßnahmen

| Bedrohung | Gegenmaßnahme |
|---|---|
| Token wird über Referrer oder Logdateien geleakt | Token nur im URL-Fragment oder manuell; Fragment nach Sessionaustausch entfernen |
| Brute Force | mindestens 256 Bit Zufall, HMAC-Hash, Turnstile, Rate Limit, generische Fehler |
| Gestohlener Token | kurze Gültigkeit, widerrufbar, begrenzte Einreichungen, Sessioncookie |
| Sessiondiebstahl | `Secure`, `HttpOnly`, `SameSite=Strict`, kurze Laufzeit, Rotation |
| CSRF | SameSite-Strict, exakte Origin-Prüfung, CSRF-Header und sessiongebundener CSRF-Hash |
| IDOR | jede D1-Abfrage bindet Case-, Session- und Objekt-ID gemeinsam |
| XSS in Berichtstext | ausschließlich Textknoten; kein `set:html`; Zeichen- und Längenlimits |
| Gefährlicher Link | nur `https:`; keine serverseitige Linkvorschau; `noopener noreferrer nofollow` |
| SVG-/HTML-Upload | vollständig blockieren |
| Falscher MIME-Type | deklarierter MIME-Type plus Magic-Byte-Prüfung |
| Speichererschöpfung | Datei-, Fall- und Bucketquoten; R2-Lifecycle; D1-Zähler |
| Worker-RAM-Überschreitung | Streaming; maximal ersten kleinen Headerblock puffern |
| E-Mail-Leak | E-Mails enthalten nur Fall-ID, Status und Adminlink |
| Access-Header-Spoofing | Access-JWT-Signatur, Issuer und Audience im Worker validieren |
| Admin-Origin-Bypass | statische Shell enthält keine Daten; alle API-Daten verlangen gültigen Access-JWT |
| Replay eines Upload-Slots | Upload-Slot ist einmalig und zustandsgebunden |
| Race Condition bei Quoten | D1-Statusübergänge und Zähler in Batch/Transaktion |
| Gelöschte Portaldatei noch in Praxis erforderlich | vor Schließen Status `exported_to_practice_system` verlangen oder bewusste Ausnahme protokollieren |
| Notfall wird digital eingereicht | prominente Notfallwarnung vor Tokenprüfung und im Formular; Notfalltelefon jederzeit sichtbar |
| Malware | kein Ausführen; private Speicherung; nur sichere Medien inline; sonst Download; klarer Hinweis, dass kein vollständiger Malware-Scan behauptet wird |

---

## 9. Ziel-Dateistruktur

```text
tierarztpraxis_schaffer/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy-pages.yml
│       ├── deploy-worker.yml
│       ├── e2e.yml
│       └── reconcile-docs.yml
├── docs/
│   ├── design/
│   │   ├── startseite-2-designvorschau.png
│   │   ├── startseite-3-designvorschau.png
│   │   └── startseite-4-designvorschau-standard.png
│   ├── BILDNACHWEISE.md
│   ├── DATENTRANSFER-BETRIEB.md
│   ├── DATENSCHUTZ-ENTSCHEIDUNGEN.md
│   ├── HISTORIE.md
│   ├── IMPLEMENTIERUNGSSTATUS.md
│   ├── TODO.md
│   └── UMSETZUNGSPLAN.md
├── public/
│   └── images/
│       ├── home/
│       │   ├── shared/
│       │   ├── variant-2/
│       │   ├── variant-3/
│       │   └── variant-4/
│       └── datentransfer/
├── scripts/
│   ├── generate-todo-markdown.ts
│   ├── inspect-contact-build.ts
│   ├── inspect-home-build.ts
│   ├── inspect-transfer-build.ts
│   └── validate-content.ts
├── src/
│   ├── components/
│   │   ├── Header.astro
│   │   ├── StartVariantMenu.astro
│   │   ├── home/
│   │   │   ├── HomePage.astro
│   │   │   ├── HomeVariant1.astro
│   │   │   ├── HomeVariant2.astro
│   │   │   ├── HomeVariant3.astro
│   │   │   ├── HomeVariant4.astro
│   │   │   ├── HomeServices.astro
│   │   │   ├── HomeOpeningHours.astro
│   │   │   ├── HomeAccessibility.astro
│   │   │   ├── HomeFaqTeaser.astro
│   │   │   ├── HomeJobsTeaser.astro
│   │   │   └── HomeMapTeaser.astro
│   │   ├── todo/
│   │   │   ├── TodoFilters.astro
│   │   │   ├── TodoGroup.astro
│   │   │   └── TodoItem.astro
│   │   └── datentransfer/
│   │       ├── TransferEntry.astro
│   │       ├── TransferCaseHeader.astro
│   │       ├── TransferReportForm.astro
│   │       ├── TransferUploadList.astro
│   │       ├── TransferThread.astro
│   │       ├── AdminCaseList.astro
│   │       ├── AdminCaseDetail.astro
│   │       ├── AdminTokenForm.astro
│   │       └── AdminReplyForm.astro
│   ├── content/
│   │   ├── home-content.ts
│   │   ├── home-variants.ts
│   │   ├── milestones.ts
│   │   └── project-todos.ts
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   ├── HomeLayout.astro
│   │   └── TransferLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── startseiten/
│   │   │   └── [variant].astro
│   │   ├── todo/
│   │   │   └── index.astro
│   │   ├── datentransfer/
│   │   │   └── index.astro
│   │   └── admin/
│   │       └── datentransfer/
│   │           └── index.astro
│   ├── scripts/
│   │   ├── contact-form.ts
│   │   ├── start-variant-menu.ts
│   │   ├── todo-filters.ts
│   │   ├── transfer-client.ts
│   │   └── admin-transfer-client.ts
│   └── styles/
│       ├── tokens.css
│       ├── reset.css
│       ├── base.css
│       ├── layout.css
│       ├── navigation.css
│       ├── forms.css
│       ├── home-shared.css
│       ├── home-1.css
│       ├── home-2.css
│       ├── home-3.css
│       ├── home-4.css
│       ├── todo.css
│       └── datentransfer.css
├── tests/
│   ├── home-variants.test.ts
│   ├── todo-registry.test.ts
│   ├── todo-render.test.ts
│   ├── contact-form-client.test.ts
│   ├── transfer-client.test.ts
│   └── e2e/
│       ├── home-variants.spec.ts
│       ├── navigation.spec.ts
│       ├── todo.spec.ts
│       ├── datentransfer.spec.ts
│       └── accessibility.spec.ts
└── worker/
    ├── migrations/
    │   └── 0001_datatransfer.sql
    ├── src/
    │   ├── index.ts
    │   ├── env.ts
    │   ├── router.ts
    │   ├── http/
    │   │   ├── errors.ts
    │   │   ├── response.ts
    │   │   ├── origin.ts
    │   │   └── cookies.ts
    │   ├── security/
    │   │   ├── access-jwt.ts
    │   │   ├── csrf.ts
    │   │   ├── hmac.ts
    │   │   ├── rate-limit.ts
    │   │   └── turnstile.ts
    │   ├── contact/
    │   │   ├── route.ts
    │   │   ├── validation.ts
    │   │   └── mail.ts
    │   ├── transfers/
    │   │   ├── routes-public.ts
    │   │   ├── routes-admin.ts
    │   │   ├── tokens.ts
    │   │   ├── sessions.ts
    │   │   ├── cases.ts
    │   │   ├── submissions.ts
    │   │   ├── uploads.ts
    │   │   ├── file-signatures.ts
    │   │   ├── file-response.ts
    │   │   ├── links.ts
    │   │   ├── replies.ts
    │   │   ├── cleanup.ts
    │   │   ├── notifications.ts
    │   │   ├── types.ts
    │   │   └── limits.ts
    │   ├── queue/
    │   │   └── consumer.ts
    │   └── scheduled/
    │       └── maintenance.ts
    ├── test/
    │   ├── contact-regression.test.ts
    │   ├── token.test.ts
    │   ├── session.test.ts
    │   ├── transfer-api.test.ts
    │   ├── upload.test.ts
    │   ├── access.test.ts
    │   ├── replies.test.ts
    │   └── cleanup.test.ts
    ├── vitest.config.ts
    └── wrangler.jsonc
```

---

## 10. Gemeinsames Inhalts- und Variantenmodell

### 10.1 Variantenregistry

```ts
// src/content/home-variants.ts
export type HomeVariantId = "1" | "2" | "3" | "4";

export interface HomeVariantDefinition {
  readonly id: HomeVariantId;
  readonly label: `Startseite ${HomeVariantId}`;
  readonly route: `/startseiten/${HomeVariantId}/`;
  readonly designName: string;
  readonly isDefault: boolean;
  readonly canonicalPath: "/";
  readonly robots: "noindex,follow";
}

export const homeVariants = [
  {
    id: "1",
    label: "Startseite 1",
    route: "/startseiten/1/",
    designName: "Bestandsvariante",
    isDefault: false,
    canonicalPath: "/",
    robots: "noindex,follow",
  },
  {
    id: "2",
    label: "Startseite 2",
    route: "/startseiten/2/",
    designName: "Premium klinisch",
    isDefault: false,
    canonicalPath: "/",
    robots: "noindex,follow",
  },
  {
    id: "3",
    label: "Startseite 3",
    route: "/startseiten/3/",
    designName: "Editorial ruhig",
    isDefault: false,
    canonicalPath: "/",
    robots: "noindex,follow",
  },
  {
    id: "4",
    label: "Startseite 4",
    route: "/startseiten/4/",
    designName: "Modern Teal/Koralle",
    isDefault: true,
    canonicalPath: "/",
    robots: "noindex,follow",
  },
] as const satisfies readonly HomeVariantDefinition[];

export const defaultHomeVariantId: HomeVariantId = "4";
```

### 10.2 Gemeinsamer Inhalt

Alle Varianten beziehen Fakten aus einer Quelle. Die Varianten dürfen Stil, Reihenfolge und Länge ändern, nicht aber Fakten.

```ts
// src/content/home-content.ts
export interface HomeCopy {
  readonly hero: {
    readonly eyebrow: string;
    readonly title: string;
    readonly accent?: string;
    readonly intro: string;
  };
  readonly philosophy: {
    readonly title: string;
    readonly paragraphs: readonly string[];
  };
  readonly accessibility: {
    readonly title: string;
    readonly text: string;
  };
}

export const sharedHomeFacts = {
  phoneDisplay: "0911 63 29 29 83",
  phoneHref: "tel:+4991163292983",
  address: "Friedrich-Ebert-Straße 17, 90766 Fürth",
  appointmentNote: "Wir bitten stets um telefonische Voranmeldung.",
  emergencyNote:
    "Das Kontaktformular und der Datentransfer sind keine Notfallkanäle.",
} as const;
```

---

## 11. Designbeschreibung der vier Startseiten

### 11.1 Startseite 1 – Bestandsvariante

**Zweck:** Referenz und sichere Rückfalloption.

**Charakter:**

- bestehende grüne Bildsprache;
- Logo-Hero;
- klare Karten;
- geringe visuelle Komplexität;
- technische Stabilität wichtiger als Inszenierung.

**Änderungen gegenüber heute:**

- Texte lebendiger formulieren;
- Abstände, Typografie und Kartenhierarchie verfeinern;
- gleiche neue Navigation;
- gleiche TODO-, Datentransfer- und Barrierefreiheitslinks;
- keine komplette Neugestaltung.

**Hero:**

> Mit Herz, Kompetenz und moderner Tiermedizin.
>
> Wir nehmen uns Zeit, hören zu und erklären verständlich, was Ihr Tier jetzt braucht.

### 11.2 Startseite 2 – Premium klinisch

**Designreferenz:** `assets/startseite-2-designvorschau.png`

**Charakter:**

- Off-White, warmes Beige, gedämpftes Teal;
- große Split-Hero-Komposition;
- Foto rechts, Text links;
- deutliches Notfalltelefon als eigene Karte;
- strukturierte Öffnungszeiten und Leistungen;
- Team-/Philosophie-Bereich;
- breite OSM-Karte;
- hochwertig, aber nicht luxuriös-abgehoben.

**Hero:**

> Mit Herz, Zeit und moderner Medizin für Ihr Tier da.
>
> Einfühlsame Betreuung, klare Worte und ein ruhiger Blick auf das, was Ihr Tier jetzt braucht.

**CTA:**

- `Termin telefonisch anfragen`
- `0911 63 29 29 83 anrufen`

### 11.3 Startseite 3 – Editorial ruhig

**Designreferenz:** `assets/startseite-3-designvorschau.png`

**Charakter:**

- Creme, Sand, Oliv und dunkles Tannengrün;
- große Serifenschrift;
- weniger Karten, mehr redaktionelle Flächen;
- ruhiges Beratungsmotiv;
- Philosophie und Sprechzeiten als zentrale Inhalte;
- keine grellen Elemente.

**Hero:**

> Vertrauen beginnt mit einem ruhigen Gespräch.
>
> Wir hören zu, erklären verständlich und nehmen uns Zeit – für Sie und Ihr Tier.

**Philosophie:**

> Jedes Tier ist einzigartig. Deshalb verbinden wir moderne Tiermedizin mit Empathie, Transparenz und einer Atmosphäre, in der Fragen willkommen sind.

### 11.4 Startseite 4 – Modern Teal/Koralle, Standard

**Designreferenz:** `assets/startseite-4-designvorschau-standard.png`

**Charakter:**

- helles Layout;
- Teal als Primärfarbe;
- Koralle sparsam für wichtige Akzente;
- schnelle Einstiege `Kontakt`, `Notfall`, `FAQ`, `Stellenangebote`;
- moderner Raster;
- Foto-Hero;
- Servicekarten;
- Team/Zugänglichkeit;
- FAQ, Jobs und Karte kompakt;
- lebendig, freundlich und klar.

**Hero:**

> Willkommen in der Tierarztpraxis Dr. Schäffer.
>
> **Persönlich. Sorgfältig. Für Ihr Tier da.**
>
> Von der Vorsorge bis zur Behandlung begleiten wir Sie mit Erfahrung, Ruhe und einem offenen Ohr.

**Standardregel:**

- `/` rendert exakt diese Variante;
- `/startseiten/4/` rendert dieselbe Komponente;
- nur `/` ist kanonisch;
- `Startseite 4` erhält im Dropdown ein sichtbares Label `Standard`.

---

## 12. Bildkonzept und Bildprovenienz

### 12.1 Designvorschauen

Die drei bereits generierten Ganzseitenbilder werden ausschließlich als Designreferenzen gespeichert. Sie dürfen nicht als fertige Website-Screenshots oder als Behauptung über das echte Team veröffentlicht werden.

### 12.2 Produktionsassets

Für jede Variante werden separate, textfreie Motive erzeugt. Alle Bilder werden ohne eingebrannte Telefonnummern, Adressen, Logos, Sternebewertungen oder erfundene Namen erzeugt.

#### Asset A – Variante 2 Hero

**Datei:** `public/images/home/variant-2/hero-vet-pets.webp`

**Briefing:**

- helle moderne Tierarztumgebung;
- ein Tierarzt oder eine Tierärztin mit Hund und Katze;
- warme, glaubwürdige Interaktion;
- keine erkennbare reale Person;
- keine Logos;
- kein Text;
- Raum links für Textüberlagerung oder rechts, entsprechend Layout;
- 3:2, mindestens 1800 × 1200;
- sichtbarer Hinweis `Symbolbild` unter dem Bild.

#### Asset B – Variante 3 Beratung

**Datei:** `public/images/home/variant-3/hero-ruhiges-gespraech.webp`

**Briefing:**

- ruhige Beratungsszene mit Tierhalter, Tierarzt und Hund;
- Creme-/Oliv-Farbstimmung;
- hochwertige, natürliche Beleuchtung;
- keine Praxisbehauptung;
- kein Text;
- 16:10, mindestens 1800 × 1125;
- `Symbolbild`.

#### Asset C – Variante 4 Hero

**Datei:** `public/images/home/variant-4/hero-hund-katze.webp`

**Briefing:**

- freundliche moderne Tierarztszene;
- Golden-Retriever-artiger Hund und getigerte Katze;
- Teal-Kleidung;
- heller Hintergrund;
- kein Text, keine Adresse, kein Logo;
- 16:9, mindestens 1920 × 1080;
- `Symbolbild`.

#### Asset D – Pet-only FAQ-Dekoration

**Datei:** `public/images/home/shared/faq-hund.webp`

- freigestellter kleiner Hund;
- kein Halsband mit Daten;
- neutraler Hintergrund;
- rein dekorativ, deshalb leeres `alt`.

#### Asset E – Abstrakte Praxisgrafik

**Datei:** `public/images/home/shared/praxis-illustration.svg`

- stilisierte Rezeption, Pflanzen, Pfotenmotiv;
- keine fotorealistische Behauptung;
- lokal gezeichnete SVG;
- keine externen Ressourcen.

### 12.3 Bildnachweisdatei

`docs/BILDNACHWEISE.md` enthält für jedes Asset:

- Dateiname;
- Erstellungsdatum;
- Generierungs-/Quellmethode;
- Prompt oder Herkunft;
- Bearbeitungsschritte;
- Verwendungszweck;
- Kennzeichnung `Symbolbild`, `Illustration` oder `echtes Praxisfoto`;
- Freigabestatus;
- Lösch-/Austauschentscheidung.

### 12.4 Technische Regeln

- WebP als primäres Format;
- optional AVIF plus JPEG-Fallback;
- feste Breite und Höhe;
- `loading="lazy"` außer LCP-Hero;
- `fetchpriority="high"` nur für Standard-Hero;
- maximal 300 KB pro Hero-WebP als Ziel;
- keine EXIF-Metadaten;
- keine Schrift oder faktischen Angaben im Bild;
- generierte Personen nie auf `/praxis/` unter der Überschrift `Unser Team`.

---

## 13. Navigation und Variantenmenü

### 13.1 Desktop

- `Start` bleibt ein normaler Link auf `/`.
- Beim Hover über den kombinierten Startbereich erscheint das Menü.
- Beim Tastaturfokus erscheint dasselbe Menü.
- Eine separate Chevron-Schaltfläche besitzt `aria-haspopup="menu"` und `aria-expanded`.
- `Escape` schließt.
- Fokus bleibt innerhalb einer logischen Reihenfolge.
- Ein kleiner unsichtbarer Hover-Korridor verhindert versehentliches Schließen.

### 13.2 Mobil

- Im mobilen `<details>`-Menü wird unter `Start` eine verschachtelte Liste angezeigt.
- Kein Hover als einzige Bedienmöglichkeit.
- Standardvariante wird mit `Standard` gekennzeichnet.

### 13.3 Komponentenschnittstelle

```astro
---
interface Props {
  currentPath: string;
}

const { currentPath } = Astro.props;
---

<StartVariantMenu currentPath={currentPath} />
```

### 13.4 Akzeptanztests

- Maus-Hover zeigt alle vier Einträge.
- Tastatur-Tab zeigt alle vier Einträge.
- `Escape` schließt das Dropdown.
- Klick auf `Start` führt nach `/`.
- Klick auf `Startseite 1–4` führt auf die korrekte Route.
- `/` besitzt `data-home-variant="4"`.
- `/startseiten/4/` besitzt ebenfalls `data-home-variant="4"`.
- Varianten 1–4 besitzen `noindex,follow` und Canonical `/`.
- Mobilmenü ist ohne Maus vollständig nutzbar.

---

## 14. TODO-Unterseite

### 14.1 Ziel

Die Seite `/todo/` wird zur sichtbaren, aus dem Code generierten Projektübersicht. Sie beantwortet:

- Was fehlt noch?
- Welche Daten sind unbestätigt?
- Welche Entscheidungen blockieren Produktion?
- Was ist in Arbeit?
- Was wurde bereits erledigt?
- Wer oder was muss eine Entscheidung liefern?
- Welche Dateien und Tests hängen daran?

### 14.2 Datenmodell

```ts
export type ProjectTodoStatus =
  | "open"
  | "in-progress"
  | "blocked"
  | "done"
  | "not-applicable";

export type ProjectTodoPriority = "P0" | "P1" | "P2" | "P3";

export type ProjectTodoCategory =
  | "content"
  | "legal"
  | "accessibility"
  | "design"
  | "infrastructure"
  | "security"
  | "datatransfer"
  | "testing"
  | "operations";

export type ProjectTodoVisibility = "public" | "internal";

export interface ProjectTodo {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: ProjectTodoStatus;
  readonly priority: ProjectTodoPriority;
  readonly category: ProjectTodoCategory;
  readonly productionBlocker: boolean;
  readonly visibility: ProjectTodoVisibility;
  readonly owner: "Praxis" | "Repository" | "Cloudflare" | "Rechtliche Prüfung";
  readonly source: string;
  readonly acceptanceCriteria: readonly string[];
  readonly relatedPaths: readonly string[];
  readonly updatedAt: string;
}
```

### 14.3 Darstellungsregeln

- P0 zuerst;
- Produktionsblocker eigene Gruppe;
- Filter nach Kategorie, Status und Verantwortlichem;
- Zähler `offen`, `in Arbeit`, `blockiert`, `erledigt`;
- keine Secrets;
- interne Einträge werden auf der Website nur abstrahiert oder gar nicht gerendert;
- `docs/TODO.md` enthält die vollständige nicht geheime Registry;
- erledigte Historie ist eingeklappt;
- Seite immer `noindex,nofollow`;
- Entwicklungsbanner verlinkt auf `/todo/`.

### 14.4 Initiale TODO-Registry

#### Inhalt und Praxisdaten

| ID | Priorität | Aufgabe | Produktionsblocker |
|---|---|---|---|
| CNT-001 | P0 | Öffentliche Praxis-E-Mail bestätigen | ja |
| CNT-002 | P0 | Behandelte Tierarten bestätigen | ja |
| CNT-003 | P0 | Vollständiges Leistungsangebot fachlich freigeben | ja |
| CNT-004 | P0 | Notdienst außerhalb der Sprechzeiten festlegen | ja |
| CNT-005 | P1 | Teammitglieder, Funktionen und Qualifikationen erfassen | ja |
| CNT-006 | P1 | Echte Praxis- und Teamfotos samt Einwilligungen bereitstellen | ja |
| CNT-007 | P2 | Urlaubs-, Feiertags- und Kurzfristhinweise organisatorisch zuordnen | ja |
| CNT-008 | P2 | Social-Media-Ziele final bestätigen | nein |
| CNT-009 | P2 | Eröffnungsrückblick final freigeben | nein |

#### Barrierefreiheit

| ID | Priorität | Aufgabe | Produktionsblocker |
|---|---|---|---|
| A11Y-001 | P1 | Lichte Eingangstürbreite messen | ja |
| A11Y-002 | P1 | Höhe der Türschwelle messen | ja |
| A11Y-003 | P1 | Praxis-WC beschreiben | ja |
| A11Y-004 | P1 | Bewegungsflächen für Rollstuhl/Rollator prüfen | ja |
| A11Y-005 | P2 | Parkplatzmerkmale präzisieren | nein |
| A11Y-006 | P2 | Barrierearme ÖPNV-Anfahrt ermitteln | nein |
| A11Y-007 | P0 | Tastaturtest aller Seiten durchführen | ja |
| A11Y-008 | P0 | 200- und 400-Prozent-Zoom prüfen | ja |
| A11Y-009 | P0 | Screenreader-Stichprobe durchführen | ja |
| A11Y-010 | P0 | axe-Tests ohne schwere oder kritische Fehler | ja |

#### Recht und Datenschutz

| ID | Priorität | Aufgabe | Produktionsblocker |
|---|---|---|---|
| LEG-001 | P0 | Berufsbezeichnung und Verleihungsstaat eintragen | ja |
| LEG-002 | P0 | Zuständige Tierärztekammer eintragen | ja |
| LEG-003 | P0 | Zuständige Aufsichtsbehörde eintragen | ja |
| LEG-004 | P0 | Berufsrechtliche Regelungen verlinken | ja |
| LEG-005 | P0 | Berufshaftpflichtangaben prüfen | ja |
| LEG-006 | P0 | Umsatzsteuer-ID oder Nichtvorhandensein klären | ja |
| LEG-007 | P0 | Impressum rechtlich freigeben | ja |
| LEG-008 | P0 | Datenschutzerklärung rechtlich freigeben | ja |
| LEG-009 | P0 | Cloudflare-Auftragsverarbeitung prüfen und dokumentieren | ja |
| LEG-010 | P0 | Verzeichnis der Verarbeitungstätigkeiten für Datentransfer ergänzen | ja |
| LEG-011 | P0 | Rechtsgrundlage und Informationspflicht für Datentransfer festlegen | ja |
| LEG-012 | P0 | Portal-Aufbewahrung und Übergabe in Praxisakte festlegen | ja |
| LEG-013 | P1 | Datenpannen- und Betroffenenrechteprozess dokumentieren | ja |

#### Design und Startseiten

| ID | Priorität | Aufgabe | Produktionsblocker |
|---|---|---|---|
| DES-001 | P1 | Startseite 1 modernisieren | nein |
| DES-002 | P1 | Startseite 2 implementieren | nein |
| DES-003 | P1 | Startseite 3 implementieren | nein |
| DES-004 | P0 | Startseite 4 als Landingpage implementieren | nein |
| DES-005 | P1 | Startseiten-Dropdown barrierefrei umsetzen | nein |
| DES-006 | P1 | Produktionsbilder erstellen und kennzeichnen | ja |
| DES-007 | P1 | Bildnachweise pflegen | ja |
| DES-008 | P2 | Visuelle Regression für vier Varianten einrichten | nein |

#### Datentransfer

| ID | Priorität | Aufgabe | Produktionsblocker |
|---|---|---|---|
| DT-001 | P0 | D1 in EU-Jurisdiktion erstellen | ja |
| DT-002 | P0 | privaten R2-Bucket in EU-Jurisdiktion erstellen | ja |
| DT-003 | P0 | Queue und Dead-Letter-Queue erstellen | ja |
| DT-004 | P0 | Access-Anwendungen und Admin-E-Mail-Policy einrichten | ja |
| DT-005 | P0 | `TOKEN_PEPPER` und Session-Secrets setzen | ja |
| DT-006 | P0 | D1-Migration anwenden | ja |
| DT-007 | P0 | Token- und Sessionlogik implementieren | ja |
| DT-008 | P0 | Berichtserstellung implementieren | ja |
| DT-009 | P0 | sichere Bild-/Video-Uploads implementieren | ja |
| DT-010 | P0 | privaten Download und Range-Support implementieren | ja |
| DT-011 | P0 | Admin-Token-Erzeugung implementieren | ja |
| DT-012 | P1 | optionale Antwort und Rückrufstatus implementieren | ja |
| DT-013 | P0 | E-Mail-Benachrichtigung ohne Berichtsinhalte | ja |
| DT-014 | P0 | Löschlauf und R2-Lifecycle konfigurieren | ja |
| DT-015 | P0 | End-to-End-Sicherheitstest | ja |
| DT-016 | P1 | Übernahme-in-Praxisakte-Status definieren | ja |
| DT-017 | P1 | Datentransfer-Betriebshandbuch erstellen | ja |

#### Infrastruktur und Betrieb

| ID | Priorität | Aufgabe | Produktionsblocker |
|---|---|---|---|
| OPS-001 | P0 | Produktions-Turnstile-Widget und Secret | ja |
| OPS-002 | P0 | Entwicklungs- und Produktions-D1/R2 trennen | ja |
| OPS-003 | P0 | Migrationsworkflow mit manueller Freigabe | ja |
| OPS-004 | P1 | R2-Speicherwarnung bei 7 GB | ja |
| OPS-005 | P1 | Queue-Reconciliation und Alarmierung | ja |
| OPS-006 | P1 | D1-Time-Travel-Restore testen | ja |
| OPS-007 | P1 | Rollback- und Incident-Runbook testen | ja |
| OPS-008 | P2 | monatliche Inhaltsprüfung terminieren | nein |

---

## 15. Datentransfer-Fachabläufe

### 15.1 Admin erzeugt einen Fall

Adminfelder:

- Tiername, erforderlich;
- interne Fallreferenz, optional;
- Tierhalter-Anzeigename, optional;
- Tokenablauf, Standard 14 Tage, maximal 30 Tage;
- maximale Einreichungen, Standard 3, maximal 5;
- maximales Gesamtvolumen, Standard 100 MB;
- Antworten erlaubt, Standard ja;
- Rückrufoption erlaubt, Standard ja;
- interne Notiz, nicht für Kunde sichtbar.

Ergebnis:

- Fall-ID;
- einmalig sichtbares Bearer-Token;
- teilbarer Link mit Fragment;
- Kopieren-Schaltfläche;
- Druckansicht ohne interne Notiz;
- Token kann nicht später erneut angezeigt, sondern nur widerrufen und ersetzt werden.

### 15.2 Tierhalter öffnet Datentransfer

1. Vor jeder Tokenverarbeitung erscheint:
   - kein Notfallkanal;
   - Notfalltelefon;
   - keine garantierte digitale Antwort;
   - maximale Dateigrößen;
   - Datenschutzhinweis.
2. Token wird aus `#token=` gelesen oder manuell eingegeben.
3. Turnstile wird gelöst.
4. `POST /api/transfers/session` tauscht Token gegen Session.
5. Fragment wird per `history.replaceState` entfernt.
6. Seite zeigt:
   - Tiername;
   - Fallreferenz nur, wenn als kundenlesbar markiert;
   - Ablauf;
   - verbleibende Einreichungen;
   - verbleibendes Volumen;
   - frühere Einreichungen und Praxisantworten.

### 15.3 Bericht erstellen

Felder:

- Überschrift, 3–120 Zeichen;
- Beobachtung/Bericht, 20–8.000 Zeichen;
- seit wann, optionales Datum oder Freitext;
- Dringlichkeit:
  - `normal`;
  - `zeitnaher Rückruf erwünscht`;
- Rückruf gewünscht, optional;
- Telefonnummer, nur wenn Rückruf gewünscht oder anders als bekannte Nummer;
- E-Mail für Benachrichtigung über Antwort, optional;
- bis zu acht HTTPS-Links;
- bis zu acht Dateien;
- Datenschutzbestätigung;
- ausdrückliche Bestätigung: `Kein Notfall`.

Es gibt keine Kategorie `Notfall`. Wer einen Notfall meldet, sieht Telefonnummer und muss abbrechen.

### 15.4 Praxis bearbeitet

Admin kann:

- neue Fälle filtern;
- Bericht und sichere Medienvorschau öffnen;
- nicht inline unterstützte Dateien herunterladen;
- Status setzen:
  - `new`;
  - `reviewing`;
  - `callback_planned`;
  - `replied`;
  - `closed`;
- optionale Antwort schreiben;
- Rückrufnotiz intern speichern;
- `in Praxisakte übernommen` markieren;
- Token widerrufen;
- Fall schließen;
- sofortige Löschung auslösen, sofern rechtlich zulässig.

### 15.5 Antwort

Eine Antwort ist optional. Das System darf keinen Antwortzwang erzeugen.

Kundenansicht:

- Antworttext;
- Datum;
- Status;
- Hinweis, dass bei Rückruf ggf. keine Textantwort erfolgt.

Benachrichtigung:

- nur wenn Kunde eine E-Mail angegeben hat;
- keine Antwort im E-Mailtext;
- kein Token im E-Mailtext;
- Hinweis, den ursprünglich erhaltenen Datentransferlink zu verwenden.

---

## 16. Token- und Sessiondesign

### 16.1 Tokenformat

```text
dt1_<publicCaseId>_<secret>
```

Beispielstruktur:

- `dt1`: Version;
- `publicCaseId`: nicht geheimer Lookup-Identifier, 12–16 Base32-Zeichen;
- `secret`: mindestens 32 zufällige Bytes, Base64URL ohne Padding.

### 16.2 Speicherung

D1 speichert:

- öffentlichen Case-Identifier;
- Tokenpräfix/Version;
- `HMAC-SHA-256(TOKEN_PEPPER, secret)`;
- Tokenhinweis, höchstens letzte vier Zeichen;
- Ablauf;
- Widerruf;
- Nutzungszähler.

Der vollständige Token wird nur bei Erzeugung an den Admin zurückgegeben.

### 16.3 HMAC-Helfer

```ts
export async function hmacHex(
  secret: string,
  value: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
```

### 16.4 Sessioncookie

```text
Name: dt_session
Secure
HttpOnly
SameSite=Strict
Path=/api/transfers/
Max-Age=1800
```

Die Session wird bei Aktivität verlängert, aber nach zwölf Stunden absolut beendet.

### 16.5 CSRF

- Sessionaustausch liefert einen CSRF-Token;
- Client speichert ihn in `sessionStorage`;
- alle mutierenden Requests senden `X-Datatransfer-CSRF`;
- D1 speichert nur HMAC;
- bei Seitenreload kann ein authentifizierter Endpoint einen neuen CSRF-Token ausstellen;
- exakte Origin-Prüfung bleibt zusätzlich aktiv.

---

## 17. D1-Schema

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE transfer_cases (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  pet_name TEXT NOT NULL CHECK(length(pet_name) BETWEEN 1 AND 120),
  owner_display_name TEXT CHECK(owner_display_name IS NULL OR length(owner_display_name) <= 160),
  internal_reference TEXT CHECK(internal_reference IS NULL OR length(internal_reference) <= 160),
  public_reference TEXT CHECK(public_reference IS NULL OR length(public_reference) <= 160),
  internal_note TEXT CHECK(internal_note IS NULL OR length(internal_note) <= 4000),
  callback_note TEXT CHECK(callback_note IS NULL OR length(callback_note) <= 4000),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open', 'closed', 'expired', 'deleted')),
  allow_replies INTEGER NOT NULL DEFAULT 1 CHECK(allow_replies IN (0, 1)),
  allow_callback INTEGER NOT NULL DEFAULT 1 CHECK(allow_callback IN (0, 1)),
  max_submissions INTEGER NOT NULL DEFAULT 3
    CHECK(max_submissions BETWEEN 1 AND 5),
  max_total_bytes INTEGER NOT NULL DEFAULT 104857600
    CHECK(max_total_bytes BETWEEN 1048576 AND 262144000),
  submission_count INTEGER NOT NULL DEFAULT 0 CHECK(submission_count >= 0),
  total_bytes INTEGER NOT NULL DEFAULT 0 CHECK(total_bytes >= 0),
  created_by_sub TEXT NOT NULL,
  created_by_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  exported_at TEXT,
  closed_at TEXT,
  delete_after TEXT NOT NULL
);

CREATE TABLE transfer_tokens (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
  token_version TEXT NOT NULL DEFAULT 'dt1',
  token_hmac TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0 CHECK(use_count >= 0)
);

CREATE TABLE transfer_sessions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL REFERENCES transfer_tokens(id) ON DELETE CASCADE,
  session_hmac TEXT NOT NULL UNIQUE,
  csrf_hmac TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE transfer_submissions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 120),
  message TEXT NOT NULL CHECK(length(message) BETWEEN 20 AND 8000),
  observed_since TEXT CHECK(observed_since IS NULL OR length(observed_since) <= 200),
  urgency TEXT NOT NULL DEFAULT 'normal'
    CHECK(urgency IN ('normal', 'callback_requested')),
  callback_requested INTEGER NOT NULL DEFAULT 0
    CHECK(callback_requested IN (0, 1)),
  callback_phone TEXT CHECK(callback_phone IS NULL OR length(callback_phone) <= 40),
  notification_email TEXT CHECK(notification_email IS NULL OR length(notification_email) <= 254),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft', 'submitted', 'reviewing', 'callback_planned', 'replied', 'closed')),
  created_at TEXT NOT NULL,
  finalized_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE transfer_files (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL REFERENCES transfer_submissions(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL CHECK(length(original_name) BETWEEN 1 AND 255),
  declared_media_type TEXT NOT NULL,
  verified_media_type TEXT,
  expected_size INTEGER NOT NULL CHECK(expected_size BETWEEN 1 AND 52428800),
  stored_size INTEGER,
  etag TEXT,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK(state IN ('pending', 'uploading', 'stored', 'rejected', 'deleted')),
  inline_safe INTEGER NOT NULL DEFAULT 0 CHECK(inline_safe IN (0, 1)),
  created_at TEXT NOT NULL,
  uploaded_at TEXT,
  delete_after TEXT NOT NULL
);

CREATE TABLE transfer_links (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES transfer_submissions(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK(length(url) BETWEEN 8 AND 2048),
  label TEXT CHECK(label IS NULL OR length(label) <= 160),
  created_at TEXT NOT NULL
);

CREATE TABLE transfer_replies (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
  submission_id TEXT REFERENCES transfer_submissions(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 8000),
  created_by_sub TEXT NOT NULL,
  created_by_email TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE transfer_notifications (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
  submission_id TEXT REFERENCES transfer_submissions(id) ON DELETE CASCADE,
  reply_id TEXT REFERENCES transfer_replies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK(kind IN ('practice_submission', 'customer_reply')),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK(state IN ('pending', 'queued', 'sent', 'failed', 'abandoned')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE transfer_audit_events (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES transfer_cases(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('admin', 'customer_session', 'system')),
  actor_reference TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_transfer_cases_status_expires
  ON transfer_cases(status, expires_at);

CREATE INDEX idx_transfer_tokens_case
  ON transfer_tokens(case_id, revoked_at, expires_at);

CREATE INDEX idx_transfer_sessions_hmac
  ON transfer_sessions(session_hmac, revoked_at, expires_at);

CREATE INDEX idx_transfer_submissions_case_created
  ON transfer_submissions(case_id, created_at DESC);

CREATE INDEX idx_transfer_files_submission_state
  ON transfer_files(submission_id, state);

CREATE INDEX idx_transfer_notifications_state_created
  ON transfer_notifications(state, created_at);
```

`internal_note` und `callback_note` sind ausschließlich für Admin- und Serverzugriffe bestimmt und dürfen nie in Public-DTOs oder Customer-API-Antworten erscheinen.

---

## 18. API-Vertrag

### 18.1 Fehlerformat

```ts
export interface ApiErrorBody {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
    readonly fields?: readonly string[];
  };
}
```

Keine Fehlerantwort enthält Token, Sessionsecret, Berichtstext oder Dateiname.

### 18.2 Public Endpoints

#### `POST /api/transfers/session`

Request:

```json
{
  "token": "dt1_...",
  "turnstileToken": "..."
}
```

Response:

```json
{
  "ok": true,
  "case": {
    "publicId": "ABCD1234EFGH",
    "petName": "Luna",
    "publicReference": "Kontrolle Haut",
    "expiresAt": "2026-08-18T20:00:00Z",
    "remainingSubmissions": 3,
    "remainingBytes": 104857600,
    "allowReplies": true
  },
  "csrfToken": "..."
}
```

#### `GET /api/transfers/case`

- verlangt Sessioncookie;
- liefert Fall, Einreichungen, Links, Dateimetadaten und Antworten;
- keine internen Adminnotizen.

#### `POST /api/transfers/submissions`

Request:

```json
{
  "title": "Veränderung am linken Ohr",
  "message": "Seit gestern kratzt sich Luna häufiger am linken Ohr ...",
  "observedSince": "Seit gestern Abend",
  "urgency": "callback_requested",
  "callbackRequested": true,
  "callbackPhone": "0911 ...",
  "notificationEmail": "kunde@example.org",
  "links": [
    {
      "url": "https://example.org/video",
      "label": "Zusätzliches Video"
    }
  ],
  "files": [
    {
      "name": "ohr-links.jpg",
      "mediaType": "image/jpeg",
      "size": 2456789
    }
  ],
  "notEmergencyConfirmed": true
}
```

Response:

```json
{
  "ok": true,
  "submissionId": "...",
  "uploads": [
    {
      "fileId": "...",
      "uploadUrl": "/api/transfers/uploads/...",
      "expiresAt": "..."
    }
  ]
}
```

#### `PUT /api/transfers/uploads/:fileId`

- Body ist die rohe Datei;
- `Content-Length` muss erwarteter Größe entsprechen;
- `Content-Type` muss erwarteter und erlaubter Art entsprechen;
- Session und CSRF erforderlich;
- Body wird gestreamt;
- Magic Bytes werden geprüft;
- Slot ist nur einmal verwendbar.

#### `POST /api/transfers/submissions/:id/finalize`

- prüft, dass alle erwarteten Dateien gespeichert sind;
- setzt `submitted`;
- aktualisiert Fallquoten;
- schreibt Notification;
- sendet Queue-Nachricht.

#### `GET /api/transfers/files/:fileId`

- Session muss zum selben Fall gehören;
- unterstützt `Range`;
- setzt `nosniff`;
- inline nur für verifizierte sichere Bilder/Videos;
- sonst `attachment`.

#### `POST /api/transfers/session/logout`

- widerruft Session;
- löscht Cookie.

### 18.3 Admin Endpoints

Alle Endpoints:

- Cloudflare Access vor dem Pfad;
- Worker validiert Access-JWT;
- exakte Origin-Prüfung;
- keine Bypass-Policy.

#### `GET /api/admin/session`

Liefert minimal:

```json
{
  "ok": true,
  "admin": {
    "email": "admin@example.org"
  }
}
```

#### `POST /api/admin/cases`

Erzeugt Fall und erstes Token. Token wird nur hier im Klartext zurückgegeben.

#### `GET /api/admin/cases`

Filter:

- Status;
- Suche nach Tiername, öffentlicher ID oder interner Referenz;
- Pagination;
- keine Volltextsuche über Berichtsinhalte in Meilenstein 2C.

#### `GET /api/admin/cases/:id`

Liefert alle Fallinformationen, Einreichungen, Dateien, Links, Antworten und Audit-Kurzverlauf.

#### `POST /api/admin/cases/:id/tokens`

Rotiert oder ergänzt Token.

#### `POST /api/admin/tokens/:id/revoke`

Widerruft Token und alle Sessions dieses Tokens.

#### `POST /api/admin/cases/:id/replies`

Speichert optionale Antwort und erzeugt optional Notification.

#### `PATCH /api/admin/cases/:id/status`

Erlaubte Übergänge werden serverseitig geprüft.

#### `POST /api/admin/cases/:id/mark-exported`

Markiert Übernahme in Praxisakte.

#### `DELETE /api/admin/cases/:id`

Nur mit zusätzlicher Bestätigung; löscht R2 und D1; Audit-Event ohne Inhalt.

---

## 19. Datei-Uploadregeln

### 19.1 Erlaubte Typen

| Art | MIME | Maximalgröße | Vorschau |
|---|---|---:|---|
| JPEG | `image/jpeg` | 12 MB | inline |
| PNG | `image/png` | 12 MB | inline |
| WebP | `image/webp` | 12 MB | inline |
| HEIC/HEIF | `image/heic`, `image/heif` | 12 MB | Download, bis Browserunterstützung geprüft |
| MP4 | `video/mp4` | 50 MB | inline mit Range |
| QuickTime | `video/quicktime` | 50 MB | abhängig vom Browser, sonst Download |
| WebM | `video/webm` | 50 MB | inline mit Range |

### 19.2 Verboten

- SVG;
- HTML;
- JavaScript;
- ausführbare Dateien;
- Archive;
- Office-Dateien;
- PDF im ersten Meilenstein;
- Dateien ohne erkannten Typ;
- Dateien mit MIME-/Magic-Byte-Widerspruch.

### 19.3 Magic-Byte-Erkennung

```ts
export type AllowedMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif"
  | "video/mp4"
  | "video/quicktime"
  | "video/webm";

export function detectMediaType(prefix: Uint8Array): AllowedMediaType | null {
  // JPEG: FF D8 FF
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  // WebP: RIFF....WEBP
  // MP4/MOV/HEIC: ftyp + zugelassene Brand
  // WebM: 1A 45 DF A3
  return null;
}
```

Die endgültige Funktion enthält konkrete Signaturtests und wird tabellengetrieben getestet.

### 19.4 R2-Key

```text
cases/<case-id>/submissions/<submission-id>/<file-id>
```

Der Originalname wird ausschließlich in D1 gespeichert und bei Ausgabe korrekt escaped.

### 19.5 Streaming

- nie `await request.arrayBuffer()` für große Dateien;
- maximal kleiner Präfix für Magic-Byte-Erkennung;
- Stream danach unverändert in R2 weiterreichen;
- bei Abbruch Slot auf `rejected` oder `pending` zurücksetzen;
- R2-Objekt bei D1-Fehler wieder löschen.

---

## 20. Cloudflare Access

### 20.1 Anwendungen

1. `tierarztpraxis-schaffer-admin-ui`
   - Host: `tierarztpraxis-schaffer.telacore.org`
   - Pfad: `/admin/*`
2. `tierarztpraxis-schaffer-admin-api`
   - Host: `tierarztpraxis-schaffer.telacore.org`
   - Pfad: `/api/admin/*`

### 20.2 Policy

- Action: `Allow`;
- Include: konkrete Admin-E-Mail-Adressen;
- Login-Methode: One-Time PIN oder vorhandener IdP;
- niemals `Include Everyone`;
- niemals `Include all valid emails`;
- Sessiondauer zunächst 4 Stunden;
- für Produktionsänderungen optional unabhängige MFA/Purpose Justification.

### 20.3 JWT-Validierung im Worker

Abhängigkeit:

```text
jose
```

Prüfungen:

- Header `Cf-Access-Jwt-Assertion` vorhanden;
- RS256-Signatur über Remote-JWKS;
- Issuer entspricht Team-Domain;
- Audience entspricht Admin-API-App;
- `exp` und `nbf`;
- E-Mail vorhanden;
- optional zusätzliche lokale E-Mail-Allowlist als Defense in Depth.

---

## 21. Queues und Benachrichtigungen

### 21.1 Queues

- `tierarztpraxis-transfer-notifications-development`;
- `tierarztpraxis-transfer-notifications-production`;
- `tierarztpraxis-transfer-notifications-dlq-development`;
- `tierarztpraxis-transfer-notifications-dlq-production`.

### 21.2 Nachrichtenformat

```ts
export type NotificationQueueMessage =
  | {
      kind: "practice_submission";
      notificationId: string;
    }
  | {
      kind: "customer_reply";
      notificationId: string;
    };
```

Keine Berichtsinhalte, Namen, Telefonnummern oder Tokens in Queue-Nachrichten.

### 21.3 Praxismail

Betreff:

```text
[Datentransfer] Neue Einreichung – Fall ABCD1234
```

Inhalt:

- öffentliche Fall-ID;
- Tiername nur nach Datenschutzfreigabe, sonst nicht;
- Anzahl Dateien;
- Status;
- Access-geschützter Adminlink;
- kein Berichtstext;
- keine Datei.

### 21.4 Kundennachricht

Nur bei angegebener E-Mail:

```text
Zu Ihrem Datentransfer liegt eine Rückmeldung vor.
Bitte verwenden Sie den ursprünglich erhaltenen Datentransfer-Link.
```

Kein Token und keine Antwort im E-Mailtext.

### 21.5 Reconciliation

Ein Cronlauf sucht:

- `pending` älter als 5 Minuten;
- `failed` mit weniger als 5 Versuchen;
- Queue-Ereignis abgelaufen oder verloren.

Er stellt Nachrichten erneut ein. Nach maximal fünf Versuchen wird `abandoned` gesetzt und im Admin-Dashboard sichtbar gemacht.

---

## 22. Löschung, Aufbewahrung und Export

### 22.1 Portal als Transferkanal

Die bevorzugte fachliche Regel lautet:

1. Praxis prüft Einreichung.
2. Relevante Information wird in die offizielle Praxisakte übernommen.
3. Admin markiert `exported_at`.
4. Fall kann geschlossen werden.
5. Portal löscht nach festgelegter Frist.
6. R2-Lifecycle löscht spätestens nach 60 Tagen als technischer Backstop.

Diese Regel ist vor Produktion rechtlich und organisatorisch freizugeben.

### 22.2 Automatische Löschung

Täglicher Cron:

- abgelaufene Sessions;
- abgelaufene Tokens;
- nicht finalisierte Uploadslots älter als 24 Stunden;
- zugehörige verwaiste R2-Objekte;
- geschlossene Fälle nach `delete_after`;
- Audit-Event `case_deleted`;
- keine personenbezogenen Inhalte im Audit.

### 22.3 Export

Admin kann ein Manifest herunterladen:

```json
{
  "casePublicId": "ABCD1234",
  "petName": "Luna",
  "submissions": [],
  "replies": [],
  "files": [
    {
      "name": "ohr-links.jpg",
      "mediaType": "image/jpeg",
      "size": 2456789
    }
  ]
}
```

Dateien werden einzeln oder als kontrolliertes Exportpaket geladen. Ein ZIP im Worker wird im Free-Tier nicht serverseitig erzeugt, weil Kompression CPU-intensiv wäre. Falls ZIP erforderlich wird, erzeugt der Admin-Client es lokal im Browser oder die Funktion wird auf einen späteren Meilenstein verschoben.

---

# 23. Implementierungstasks

## Task 0: Arbeitsbranch, Worktree und Baseline

**Dateien:**

- keine Produktivänderung im ersten Schritt;
- Plan nach `docs/UMSETZUNGSPLAN.md` übernehmen.

**Interfaces:**

- konsumiert aktuellen `main`;
- produziert isolierten Branch `feature/home-variants-datatransfer`.

**Ausführungsmodus:** Der Controller provisioniert Worktree und Branch vor dem Dispatch aus `origin/main`. Task 0 verifiziert diesen Zustand und erstellt weder einen zweiten Worktree noch einen zweiten Branch.

**Status:** abgeschlossen am 2026-08-04. **Evidenz:** Der vorprovisionierte Controller-Worktree auf `feature/home-variants-datatransfer` war nach `git fetch origin --prune` sauber und exakt bei `origin/main` (`ce6e3c1`); Baseline vollständig grün.

**Lokale Development-Konfiguration:** Für `pnpm test` und `pnpm build` im sauberen Checkout Werte aus `.env.example` explizit setzen, nicht als Shellcode sourcen und keine `.env` committen; `PUBLIC_TURNSTILE_SITE_KEY` ist für `site-config` erforderlich.

- [x] **Schritt 1:** Vorprovisionierten Ausgangsstand verifizieren.

```bash
git fetch origin --prune
git rev-parse HEAD origin/main
```

- [x] **Schritt 2:** Baseline prüfen.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm worker:check
pnpm test
pnpm build
```

**Erwartung:** alle Befehle erfolgreich; Entwicklungsplatzhalter dürfen nur als dokumentierte Warnungen erscheinen.

- [x] **Schritt 3:** Vorprovisionierten Worktree verifizieren.

```bash
git worktree list --porcelain
git branch --show-current
```

- [x] **Schritt 4:** Plan synchronisieren und committen.

```bash
git add docs/UMSETZUNGSPLAN.md
git commit -m "docs: masterplan für startseiten und datentransfer"
```

---

## Task 1: Designreferenzen und Bildrichtlinie

**Dateien:**

- Create: `docs/design/startseite-2-designvorschau.png`
- Create: `docs/design/startseite-3-designvorschau.png`
- Create: `docs/design/startseite-4-designvorschau-standard.png`
- Create: `docs/BILDNACHWEISE.md`
- Test: `tests/image-policy.test.ts`

**Interfaces:**

- produziert freigegebene Dateinamen und Kennzeichnungen für Home-Komponenten.

- [x] **Schritt 1:** Failing Test für Nachweise jedes veröffentlichten Bildes geschrieben.
- [x] **Schritt 2:** RED bestätigt: Nachweisdatei und veröffentlichte Assets fehlten.
- [x] **Schritt 3:** Drei Designpreviews ausschließlich aus den benannten `assets/`-Einträgen des geprüften ZIP nach `docs/design/` kopiert.
- [x] **Schritt 4:** `docs/BILDNACHWEISE.md` mit vollständiger Methode, Herkunft/Prompt, Bearbeitung, Zweck, Kennzeichnung, Freigabe- und Austauschstatus angelegt.
- [x] **Schritt 5:** Vier getrennt generierte Rastermotive als bereinigte WebP-Assets gespeichert; lokale SVG-Illustration ergänzt.
- [x] **Schritt 6:** Policy-Test verbietet jeden Designpreview-Dateinamen rekursiv unter `public/`.
- [x] **Schritt 7:** GREEN: `pnpm vitest run tests/image-policy.test.ts` (3/3).

```bash
pnpm vitest run tests/image-policy.test.ts
```

- [x] **Schritt 8:** Commit `feat: designreferenzen und bildrichtlinie ergänzen`.

```bash
git add docs/design docs/BILDNACHWEISE.md public/images/home tests/image-policy.test.ts
git commit -m "feat: designreferenzen und bildrichtlinie ergänzen"
```

**Fixrunde 1:** Der Policy-Test ermittelt veröffentlichte Visuals jetzt dynamisch anhand webüblicher Bildendungen unter `public/` und verlangt pro Datei einen vollständigen Nachweis. Für `public/favicon.svg` und `public/logo.svg` sind nur belegbare Repositorydaten dokumentiert; ursprüngliche Erstellung, Quelle und externe Freigabe bleiben ausdrücklich offen. Die Preview-Sperre prüft den Basisnamen und erfasst damit auch verschachtelte Pfade. RED: fehlende Nachweise für bestehenden Repositorybestand und nicht erkannter synthetischer Nested-Pfad. GREEN: `tests/image-policy.test.ts` 5/5, `pnpm check` 0 Fehler/Warnungen, `pnpm test` 39 + 6 und `pnpm build` 12 Seiten unter dokumentierter Development-Umgebung mit 11 erwarteten Warnungen.

---

## Task 2: Gemeinsames Inhaltsmodell, Meilensteine und TODO-Registry

**Status:** abgeschlossen am 2026-08-04. Code-Evidenz: Commits `24470f5`, `c83e466`, `0364114`.

**Dateien:**

- Create: `src/content/home-content.ts`
- Create: `src/content/home-variants.ts`
- Create: `src/content/milestones.ts`
- Create: `src/content/project-todos.ts`
- Create: `tests/home-variants.test.ts`
- Create: `tests/todo-registry.test.ts`
- Modify: `src/config/site.ts`
- Modify: `scripts/validate-content.ts`

**Interfaces:**

- `homeVariants`;
- `defaultHomeVariantId`;
- `projectTodos`;
- `historicalMilestones`;
- `getOpenProductionBlockers()`.

- [x] **Schritt 1:** Failing Tests für eindeutige Variant-IDs, genau eine Standardvariante und Standard-ID `4`. RED: fehlende reale Module; GREEN: 2 Tests.
- [x] **Schritt 2:** Failing Tests für eindeutige TODO-IDs, erlaubte Statuswerte und vollständige Akzeptanzkriterien. RED: fehlendes reales Modul; GREEN: 5 Tests einschließlich Prozessvalidator.
- [x] **Schritt 3:** Registry implementieren. 65 initiale, nicht geheime Einträge mit Status, Owner, Kriterien und Produktionsblockern.
- [x] **Schritt 4:** Historische Meilensteine H0–H16 übertragen; H15 enthält verbindlich `Neue Seite TODO` und `strukturierte TODO-Registry`.
- [x] **Schritt 5:** `siteConfig` bezieht gemeinsame Telefon- und Terminfakten aus `sharedHomeFacts`; Startseitenkopie liegt in `sharedHomeCopy`, direkte Consumer verwenden diese Quelle.
- [x] **Schritt 6:** Validator erweitern:
  - Produktionsbuild scheitert bei offenem `productionBlocker`;
  - accidental `TODO|TBD|CHANGEME` außerhalb Registry/Docs bleibt Fehler;
  - Registry selbst ist kein unbeabsichtigter Platzhalter.
- [x] **Schritt 7:** Tests. `pnpm vitest run tests/home-variants.test.ts tests/todo-registry.test.ts` (7/7), `pnpm validate:content`, `pnpm check` (0 Fehler/Warnungen), `pnpm test` (32 + 6), `pnpm build` unter dokumentierter Development-Umgebung.

```bash
pnpm vitest run tests/home-variants.test.ts tests/todo-registry.test.ts
pnpm validate:content
```

- [x] **Schritt 8:** Commit `24470f5` (`feat: startseiten und projekt-todos zentral modellieren`).

**Fixrunde 1:** RED: H15-Charakterisierung lieferte abweichenden Text; gerenderte Home-Copy hatte keinen Wert. GREEN: `tests/milestones.test.ts` und `tests/home-copy.test.ts` (2/2). `pnpm check` meldet 0 Fehler/Warnungen; `pnpm test` 32 + 6; `pnpm build` erstellt 12 Seiten. Commit `c83e466` (`fix: gemeinsame home-copy und H15 korrigieren`).

**Fixrunde 2:** H15s zwei verbindliche historische Werte werden beim Platzhalterscan gezielt und nur beim ersten exakten Vorkommen neutralisiert; alle anderen Dateien und Platzhalter bleiben geprüft. RED: `tests/content-validator.test.ts` meldete `src/content/milestones.ts`; GREEN: 1/1, temporärer fremder `TODO` in `src` bleibt Validatorfehler. `pnpm check` meldet 0 Fehler/Warnungen; `pnpm test` 33 + 6; `pnpm build` erstellt 12 Seiten mit 11 erwarteten Development-Warnungen. Commit `0364114` (`fix: H15 vom platzhalter-gate ausnehmen`).

**Fixrunde 3:** RED: Ein kanonischer H15-Ziel- und Evidenztext außerhalb des H15-Datensatzes wurde durch die wertbasierte Ausnahme geschluckt. GREEN: Der Validator neutralisiert nur noch den vollständigen kanonischen serialisierten H15-Datensatz; fremde gleiche Werte bleiben Platzhalterfehler. `tests/content-validator.test.ts` 2/2, `pnpm check` 0 Fehler/Warnungen, `pnpm test` 34 + 6 und `pnpm build` unter dokumentierter Development-Umgebung mit 11 erwarteten Warnungen und 12 Seiten. Commit `840c9d2` (`fix: H15 validator scope`).

**Fixrunde 4:** Ein vollständiger Testlauf nach Task 1 deckte ein Race auf: `tests/content-validator.test.ts` überschrieb zeitweise das getrackte `src/content/milestones.ts`, während `tests/milestones.test.ts` das Modul parallel importierte. Der Negativtest arbeitet nun ausschließlich mit synthetischem Inhalt und der kleinen reinen Funktion `exemptHistoricalH15Placeholders()`; der reale Validator-Prozesstest bleibt erhalten. RED: Die zunächst identische Transformation ließ den kanonischen H15-Block unverändert. GREEN: fokussiert 3/3; `pnpm check` 0 Fehler/Warnungen; zwei aufeinanderfolgende vollständige Läufe jeweils 37 + 6 Tests; `pnpm build` unter dokumentierter Development-Umgebung mit 11 erwarteten Warnungen und 12 Seiten. Commit `debe5c0` (`test: H15-validator race beseitigen`).

```bash
git add src/content src/config/site.ts scripts/validate-content.ts tests
git commit -m "feat: startseiten und projekt-todos zentral modellieren"
```

---

## Task 3: CSS-Designsystem modularisieren

**Dateien:**

- Create: `src/styles/tokens.css`
- Create: `src/styles/reset.css`
- Create: `src/styles/base.css`
- Create: `src/styles/layout.css`
- Create: `src/styles/navigation.css`
- Create: `src/styles/forms.css`
- Create: `src/styles/home-shared.css`
- Modify: `src/styles/global.css`
- Modify: `src/layouts/BaseLayout.astro`
- Test: `scripts/inspect-home-build.ts`

**Interfaces:**

- CSS Custom Properties bleiben globale stabile Schnittstelle;
- Varianten dürfen nur eigene `data-home-variant`-Scopes überschreiben.

- [x] **Schritt 1:** Build-Artefakt-Inspektor `scripts/inspect-home-build.ts` prüft reale `dist/index.html`- und CSS-Assets auf First-Party-CSS, vorhandene Assets, fehlende Inline-Styles, fehlende Remote-Styles/-Fonts und CSP `style-src 'self'` ohne `unsafe-inline`. Bestehender Build: Characterization-GREEN.
- [x] **Schritt 2:** CSS ohne sichtbare Änderung aus `global.css` in Layerdateien aufteilen; Selektoren, Deklarationen, Breakpoints und Komponentenreihenfolge bleiben erhalten.
- [x] **Schritt 3:** Typografiestacks definieren:

```css
--font-body: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
```

- [x] **Schritt 4:** minimale Abstands-, Radius-, Schatten- und Farb-Tokens ergänzen; bestehende Custom Properties bleiben kompatibel und global.
- [x] **Schritt 5:** `pnpm check`, Build sowie Home- und Kontakt-Artefaktinspektor unter dokumentierter lokaler Development-Konfiguration ausgeführt; Website 39/39 und Worker 6/6 grün.
- [x] **Schritt 6:** Intentional Commit `refactor: css in belastbares designsystem aufteilen`.

**Abschluss 2026-08-04:** `BaseLayout.astro` importiert `global.css` sowie die sieben Module in fester Reihenfolge; `global.css` deklariert weiterhin die globale Layerordnung. Die 125 bestehenden CSS-Zeilen bleiben erhalten, mit der allein erforderlichen, visuell äquivalenten Umstellung des bisherigen Body-Stacks auf `var(--font-body)`. Der Entwicklung-Build erzeugt 12 Seiten mit 11 dokumentierten Platzhalterwarnungen. Home- und Kontakt-Artefakte sind CSP-konform.

**Fixrunde 1:** Der Home-Inspektor parst Linkattribute jetzt für doppelt, einfach und nicht zitierte Werte. `rel`-Tokens und `as=font` werden case-insensitiv klassifiziert; unquotierte gemischt geschriebene Remote-Stylesheets und Font-Preloads sind durch Regressionstest geschützt. `inspect:home-build` ist als Paket-Skript definiert und wird in CI nach dem Build vor dem bestehenden Kontaktinspektor ausgeführt. RED: fehlender Helper sowie fehlendes Skript. GREEN: fokussiert 17/17; `pnpm check` 0 Fehler/Warnungen/Hinweise; Development-Build 12 Seiten und 11 erwartete Platzhalterwarnungen; Home-/Kontakt-Inspektoren grün; Vollsuite Website 41/41 und Worker 6/6.

```bash
git add src/styles src/layouts/BaseLayout.astro scripts/inspect-home-build.ts
git commit -m "refactor: css in belastbares designsystem aufteilen"
```

---

## Task 4: Barrierefreies Startseiten-Dropdown

**Dateien:**

- Create: `src/components/StartVariantMenu.astro`
- Create: `src/scripts/start-variant-menu.ts`
- Modify: `src/components/Header.astro`
- Modify: `src/styles/navigation.css`
- Create: `tests/e2e/navigation.spec.ts`

**Interfaces:**

- Props `currentPath`;
- IDs `start-variant-trigger` und `start-variant-menu`.

- [x] **Schritt 1:** Playwright-Test für Hover, Fokus, Escape und vier Einträge schreiben.
- [x] **Schritt 2:** Test gegen aktuellen Stand ausführen; erwarteter Fehler: Menü fehlt.
- [x] **Schritt 3:** Desktop-Komponente implementieren.
- [x] **Schritt 4:** Mobilmenü verschachteln.
- [x] **Schritt 5:** Escape- und Outside-Click-Verhalten in First-Party-Modul implementieren.
- [x] **Schritt 6:** CSP-Artefakttest um neues Modul erweitern.
- [x] **Schritt 7:** Tests und Build.

```bash
pnpm check
pnpm playwright test tests/e2e/navigation.spec.ts
pnpm build
```

- [x] **Schritt 8:** Commit.

```bash
git add src/components src/scripts src/styles/navigation.css tests/e2e/navigation.spec.ts
git commit -m "feat: vier startseiten über barrierefreies dropdown auswählbar machen"
```

**Abschluss 2026-08-04:** `StartVariantMenu.astro` rendert auf Desktop den normalen Start-Link, eine separate Chevron-Schaltfläche sowie vier Einträge aus `homeVariants`; alle URLs laufen über `withBase`. Das externe First-Party-Modul öffnet bei Hover/Fokus und schließt bei Escape oder Outside-Click, ohne Inline-Handler. Das Mobilmenü enthält dieselbe verschachtelte Viererliste mit sichtbarer Standardmarkierung und ohne doppelte IDs. Playwright 1.60.0 nutzt Build plus Preview mit dokumentierter Development-Umgebung. RED: fehlende Desktop-/Mobilmenü-Selektoren und Einträge. GREEN: 5/5 Navigation-E2E, 42/42 Website-Tests, 6/6 Worker-Tests, `pnpm check`, Build sowie Home-/Kontakt-Artefaktinspektoren grün.

**Fixrunde 1/5 – 2026-08-04:** `mouseleave` schloss das Menü zuvor auch dann, wenn der Fokus weiter auf einem Menüeintrag lag; der nachgelagerte `focusout`-Guard konnte diesen Verlust nicht verhindern. RED: fokussierter `Startseite 1`-Eintrag, Zeiger aus Container bewegt, Menü nicht mehr sichtbar. GREEN: `mouseleave` schließt nur ohne `document.activeElement` im Container; der neue E2E-Test hält Menü und Fokus sichtbar. 6/6 Navigation-E2E, `pnpm check`, Development-Build, Home-/Kontakt-Artefaktinspektoren sowie Website 42/42 und Worker 6/6 grün.

---

## Task 5: Variantenrouting und gemeinsamer Home-Renderer

**Dateien:**

- Create: `src/components/home/HomePage.astro`
- Create: `src/layouts/HomeLayout.astro`
- Modify: `src/pages/index.astro`
- Create: `src/pages/startseiten/[variant].astro`
- Test: `tests/e2e/home-variants.spec.ts`

**Interfaces:**

```ts
interface HomePageProps {
  readonly variant: HomeVariantId;
  readonly canonicalPath: "/";
  readonly robots: "index,follow" | "noindex,follow";
}
```

- [x] **Schritt 1:** Tests für `/`, `/startseiten/1/` bis `/startseiten/4/`.
- [x] **Schritt 2:** `getStaticPaths()` implementieren.
- [x] **Schritt 3:** `/` auf Variante 4 verdrahten.
- [x] **Schritt 4:** Canonical und Robots korrekt setzen.
- [x] **Schritt 5:** ungültige Varianten erzeugen keine Seite.
- [x] **Schritt 6:** Build-Artefakt prüfen.
- [x] **Schritt 7:** Commit.

```bash
git add src/components/home src/layouts/HomeLayout.astro src/pages tests/e2e/home-variants.spec.ts
git commit -m "feat: gemeinsames routing für vier startseiten einführen"
```

**Abschluss 2026-08-04:** `HomePage.astro` enthält nun den einmaligen bisherigen Startseiteninhalt und markiert seine Wurzel mit `data-home-variant`; `HomeLayout.astro` kapselt die gemeinsamen Metadaten. `/` übergibt `defaultHomeVariantId` (`4`), während `[variant].astro` seine vier statischen Pfade ausschließlich aus `homeVariants` erzeugt. Root und Varianten canonicalisieren auf `/`; `resolveRobots()` erzwingt in Development `noindex,nofollow`, in Production gelten die expliziten Root-/Variantenwerte. RED: fehlende Home-Wurzel und fehlender Robots-Resolver; GREEN: 3/3 Home-E2E, 6/6 Navigation-E2E, 44/44 Website-Tests, 6/6 Worker-Tests, `pnpm check`, dokumentierter Development-Build und beide Build-Inspektoren. Der Build enthält genau `/startseiten/1/` bis `/startseiten/4/`, keine `/startseiten/5/`. Ohne dokumentierte Development-Umgebungsvariablen schlagen `pnpm build` und `pnpm test` vor dem Task-Code an der fehlenden Turnstile-Konfiguration fehl.

---

## Task 6: Startseite 1 modernisieren

**Dateien:**

- Create: `src/components/home/HomeVariant1.astro`
- Create: `src/styles/home-1.css`
- Modify: `src/content/home-content.ts`
- Test: `tests/e2e/home-variants.spec.ts`

- [x] bestehende Struktur in Komponente überführen;
- [x] lebendigere Bestandskopie einsetzen;
- [x] Kartenhierarchie und Abstände verfeinern;
- [x] keine Fakten ändern;
- [x] mobile und 400-Prozent-Reflow-Prüfung;
- [x] Screenshot-Snapshot Desktop und Mobil;
- [x] Commit:

```bash
git commit -m "feat: startseite 1 als modernisierte bestandsvariante"
```

**Abschluss 2026-08-04:** Variante 1 verwendet eine eigene Bestandskomponente mit der freigegebenen Hero-Copy und ausschließlich unter `data-home-variant="1"` begrenzten Verfeinerungen. Varianten 2–4 behalten den bisherigen gemeinsamen Fallback unverändert. Desktop- und Mobil-Snapshots wurden nach visueller Prüfung aufgenommen; Hero-Copy, Fallback-Isolation und 320-CSS-Pixel-Reflow sind per E2E abgedeckt.

**Fixrunde 1/5 – 2026-08-04:** Die drei bestehenden Service-TODO-Karten liegen nun einmalig in `sharedServicePlaceholderCards` und werden von Bestandsfallback sowie Variante 1 gerendert. Der Development-Validator meldet damit wieder die vorherigen 11 erlaubten Platzhalterdateien; Texte, Fakten, Design und Snapshots bleiben unverändert.

---

## Task 7: Startseite 2 implementieren

**Dateien:**

- Create: `src/components/home/HomeVariant2.astro`
- Create: `src/styles/home-2.css`
- Use: `public/images/home/variant-2/hero-vet-pets.webp`

- [x] Hero-Split;
- [x] Notfallkarte;
- [x] Öffnungszeiten;
- [x] gemeinsame Servicekarten;
- [x] Philosophie-/Praxisteaser;
- [x] Zugänglichkeit;
- [x] FAQ und Jobs;
- [x] Kartenbereich;
- [x] `Symbolbild`-Hinweis;
- [x] axe und Screenshot;
- [x] Commit:

```bash
git commit -m "feat: startseite 2 im premium-klinischen design"
```

**Abschluss 2026-08-04:** Variante 2 rendert ausschließlich über `HomeVariant2` mit lokalem, sichtbar als `Symbolbild` gekennzeichnetem Hero. Alle neuen Regeln sind auf `[data-home-variant="2"]` begrenzt; Varianten 1, 3 und 4 bleiben isoliert. E2E deckt Copy, CTAs, Bildattribute, Pflichtbereiche, axe ohne schwere/kritische Befunde, 320-CSS-Pixel-Reflow und einen maskierten OSM-Desktop-Snapshot ab.

---

## Task 8: Startseite 3 implementieren

**Dateien:**

- Create: `src/components/home/HomeVariant3.astro`
- Create: `src/styles/home-3.css`
- Use: `public/images/home/variant-3/hero-ruhiges-gespraech.webp`

- [x] editorialer Hero;
- [x] Serifentypografie;
- [x] ruhige Servicezeile;
- [x] Sprechzeiten-/Philosophie-Doppelkarte;
- [x] Zugänglichkeit;
- [x] FAQ, Jobs und Karte;
- [x] keine erfundenen Qualifikationen;
- [x] Snapshot und axe;
- [x] Commit:

```bash
git commit -m "feat: startseite 3 im ruhigen editorial-design"
```

**Abschluss 2026-08-04:** Variante 3 rendert ausschließlich über `HomeVariant3` mit freigegebener Hero- und Philosophie-Copy sowie lokalem, sichtbar als `Symbolbild` gekennzeichnetem Hero. `OpeningHours`, `OsmMap`, `siteConfig.accessibility` und `sharedServicePlaceholderCards` bleiben gemeinsame Fakten- und Komponentenquellen. Alle neuen Regeln sind auf `[data-home-variant="3"]` begrenzt; Varianten 1, 2 und 4 bleiben isoliert. E2E deckt Copy, Telefon-/Inhalts-CTAs, Bildattribute, Pflichtbereiche, CSS-/Markup-Isolation, axe ohne schwere/kritische Befunde, 320-CSS-Pixel-Reflow und einen nach visueller Prüfung übernommenen, maskierten OSM-Desktop-Snapshot ab.

---

## Task 9: Startseite 4 implementieren und als Standard setzen

**Dateien:**

- Create: `src/components/home/HomeVariant4.astro`
- Create: `src/styles/home-4.css`
- Use: `public/images/home/variant-4/hero-hund-katze.webp`
- Modify: `src/pages/index.astro`

- [x] Teal-/Koralle-Tokens;
- [x] Hero und lebendige Copy;
- [x] Schnellzugriffe Kontakt, Notfall, FAQ, Stellenangebote;
- [x] Öffnungszeiten-Floating-Card;
- [x] Servicekarten;
- [x] Praxis-/Zugänglichkeitsband;
- [x] FAQ, Jobs und OSM;
- [x] Footer-CTA;
- [x] `data-home-variant="4"`;
- [x] `/` und `/startseiten/4/` strukturell identisch;
- [x] LCP-Bild priorisieren;
- [x] Snapshot, axe, Reflow;
- [x] Commit:

```bash
git commit -m "feat: startseite 4 als moderne standard-landingpage"
```

**Abschluss 2026-08-04:** `/` und `/startseiten/4/` rendern dieselbe `HomeVariant4`-Struktur mit freigegebener dreiteiliger Hero-Copy, lokalem 1920 × 1080 WebP, sichtbarer Caption unter den Bildpixeln und `fetchpriority="high"`. `OpeningHours`, `OsmMap`, `siteConfig.accessibility` und `sharedServicePlaceholderCards` bleiben gemeinsame Fakten- und Komponentenquellen; unbestätigte Inhalte der Designvorschau wurden nicht übernommen. Alle neuen Regeln sind auf `[data-home-variant="4"]` begrenzt, Varianten 1–3 bleiben visuell unverändert. E2E deckt Root-/Varianten-Gleichheit, Canonical/Robots, Schnellzugriffe, Pflichtbereiche, sichtbare Standardmarkierung, CSS-Isolation, axe ohne schwere/kritische Befunde, 320-CSS-Pixel-Reflow und einen visuell geprüften, OSM-maskierten Desktop-Snapshot ab.

---

## Task 10: TODO-Seite und Markdown-Synchronisierung

**Dateien:**

- Create: `src/pages/todo/index.astro`
- Create: `src/components/todo/*`
- Create: `src/scripts/todo-filters.ts`
- Create: `src/styles/todo.css`
- Create: `scripts/generate-todo-markdown.ts`
- Create/Generate: `docs/TODO.md`
- Modify: `src/components/DevelopmentBanner.astro`
- Modify: `.github/workflows/ci.yml`
- Test: `tests/todo-render.test.ts`, `tests/e2e/todo.spec.ts`

- [x] Failing Test für Produktionsblockergruppe und keine internen Secrets.
- [x] Seite aus Registry rendern.
- [x] Filter ohne zwingendes JavaScript nutzbar machen; JS verbessert nur Komfort.
- [x] Entwicklungsbanner auf `/todo/` verlinken.
- [x] Markdown generieren.
- [x] CI führt Generator aus und verlangt sauberen Git-Diff.
- [x] Seite immer `noindex,nofollow`.
- [x] Test, dass `visibility: internal` nicht öffentlich erscheint.
- [x] Commit:

```bash
git commit -m "feat: zentrale todo-seite und synchrones markdown einführen"
```

**Abschluss 2026-08-04:** `/todo/` rendert die öffentliche Sicht direkt aus `projectTodos`, gruppiert 52 aktive Produktionsblocker vor fünf weiteren offenen Aufgaben und hält die acht belegten Designaufgaben DES-001 bis DES-008 als eingeklappte Historie. Interne Einträge werden vor Zählung, Sortierung, Website und Markdown vollständig verworfen. Native Radiofilter und gescopte `:has()`-Regeln filtern Kategorie, Status und Verantwortliche ohne JavaScript; das externe First-Party-Skript ergänzt ausschließlich Ergebniszahl und Reset-Komfort über sichere DOM-APIs. Seite und Development-Banner sind base-path-sicher, die Seite fordert auch in Produktion `noindex,nofollow` an. Der pure Generator erzeugt `docs/TODO.md` ohne Laufzeitstempel deterministisch; CI regeneriert die Datei und prüft ihren Git-Diff. Unit- und E2E-Tests decken öffentliche Sichtgrenze, Statuszähler, P0-/ID-Sortierung, bytegleiche Generierung, Canonical/Robots, No-JS-Filter, JS-Komfort und 320-Pixel-Reflow ab.

---

## Task 11: Home-Qualitätsgate

**Dateien:**

- Modify: `package.json`
- Modify: `playwright.config.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `scripts/check-home-budgets.ts`
- Create: `tests/home-budget.test.ts`
- Create: `tests/home-quality-config.test.ts`
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/e2e.yml`

**Abhängigkeiten:**

- `@playwright/test`;
- `@axe-core/playwright`.

- [x] Vorhandene Playwright-/axe-Pins und Lockfile unverändert wiederverwenden.
- [x] Desktop-, Tablet- und Mobileprojekte.
- [x] axe auf allen vier Homevarianten.
- [x] Tastaturnavigation.
- [x] 200-/400-Prozent-Reflow.
- [x] Bildgrößen-/Bundlebudgetscript.
- [x] keine Drittanbieterrequests außer ausdrücklich erlaubten Diensten.
- [x] CI mit Artefakten bei Snapshotfehlern.
- [x] Commit:

```bash
git commit -m "test: startseiten mit playwright und axe absichern"
```

**Abschluss 2026-08-04:** Playwright nutzt die drei Chromium-Projekte `desktop`, `tablet` und `mobile`; nur Desktop führt alle Specs und bestehende Goldens aus, Tablet und Mobile ausschließlich den Accessibility-Spec. Alle vier Homevarianten bestehen axe ohne schwere oder kritische Verstöße, Skip-Link-/Fokusprüfung sowie Reflow bei 640 und 320 CSS-Pixeln. Root übernimmt axe- und Tastaturvertrag auf Desktop. Eine exakte Host-Positivliste erlaubt nur Same-Origin sowie benannte OpenStreetMap-Hosts. Das pure, per Unit-Test abgedeckte Budgetgate erzwingt 100 KiB pro Raster, 256 KiB Raster gesamt, 10 KiB pro SVG, 64 KiB Build-CSS und 32 KiB First-Party-JavaScript; aktueller Build liegt bei 229772, 28987 und 4183 Byte. Haupt-CI prüft Budgets direkt nach Build; separater E2E-Workflow installiert nur Chromium und lädt Fehlerartefakte kurzzeitig hoch. RED: fehlendes Budgetmodul, fehlende drei Projekte, Paket-Skripte und Workflows. GREEN: 17/17 gezielte Unit-Tests, 76 bestandene E2E plus vier bewusste Desktop-only-Skips, Astro Check 77 Dateien mit 0/0/0 und Gesamttests 65 Website plus 6 Worker. Home-Markup/-CSS sowie Lockfile bleiben unverändert. Die siteweiten Registrypunkte A11Y-007, A11Y-008 und A11Y-010 bleiben offen, weil Task 11 nur Root und Homevarianten abdeckt.

---

## Task 12: Worker modularisieren, Kontaktformular unverändert halten

**Dateien:**

- Split: `worker/src/index.ts`
- Create: `worker/src/router.ts`
- Create: `worker/src/http/*`
- Create: `worker/src/security/*`
- Create: `worker/src/contact/*`
- Rename test: `worker/test/contact-regression.test.ts`

**Interfaces:**

```ts
export interface RouteContext {
  readonly request: Request;
  readonly env: Env;
  readonly ctx: ExecutionContext;
  readonly requestId: string;
  readonly url: URL;
}
```

- [x] bestehende Kontakt-Tests als Regression einfrieren;
- [x] Worker-Router extrahieren;
- [x] Kontaktlogik ohne Verhaltensänderung verschieben;
- [x] exakt gleiche Statuscodes und Fehlertexte;
- [x] `pnpm worker:check` und alle sechs bisherigen Tests;
- [x] Remote-Healthcheck im Development;
- [x] Commit:

```bash
git commit -m "refactor: worker für kontakt und datentransfer modularisieren"
```

**Abschluss 2026-08-04:** Der Worker besitzt jetzt einen schmalen Entrypoint, den zentralen Router und die vorgesehenen Grenzen `http`, `security` und `contact`; `RouteContext` entspricht der festgelegten Schnittstelle. 21 Kontakt-Regressionstests frieren Statuscodes, Fehlerkörper, Header, Validierung, Bot-/Rate-Limit-/Turnstile-Verhalten, Empfängerwahl, Mailinhalt und Logging ein; ein Strukturtest deckt die importierbare Routergrenze ab. RED war der fehlende Router, GREEN sind 22/22 Worker-Tests. Wrangler 4.107 erzeugt und prüft environment-spezifische Worker-Typen; `secrets.required` enthält ausschließlich die Namen `TURNSTILE_SECRET` und `RATE_LIMIT_SALT`, keine Werte. `pnpm worker:check`, Astro Check mit 0/0/0, Development-Build mit 17 Seiten, 65 Website-Tests sowie Playwright mit 76 bestandenen und vier bewussten Skips sind grün. Der nur lesende Remote-Healthcheck antwortet mit HTTP 200 und `environment: "development"`; es erfolgte kein Deployment. Repository-`format:check` bleibt durch den bereits vorhandenen inkompatiblen Default-Import von `prettier-plugin-astro` blockiert; neue handgeschriebene TypeScript- und Testdateien bestehen die äquivalente Prettier-Prüfung mit Print Width 88, während `wrangler.jsonc` sein bestehendes Format behält.

---

## Task 13: Cloudflare-Ressourcen für Development erstellen

**Manuelle Cloudflare-Ressourcen:**

```bash
cd worker

pnpm exec wrangler d1 create \
  tierarztpraxis-schaffer-transfer-development \
  --jurisdiction eu

pnpm exec wrangler r2 bucket create \
  tierarztpraxis-schaffer-transfer-development \
  --jurisdiction eu \
  --storage-class Standard

pnpm exec wrangler queues create \
  tierarztpraxis-transfer-notifications-development

pnpm exec wrangler queues create \
  tierarztpraxis-transfer-notifications-dlq-development
```

**Dateien:**

- Modify: `worker/wrangler.jsonc`
- Modify: `worker/src/env.ts`
- Modify: `docs/CLOUDFLARE-SETUP.md`

**Bindings:**

- `TRANSFER_DB`;
- `TRANSFER_FILES`;
- `TRANSFER_NOTIFICATIONS`;
- Queue consumer;
- Cron täglich;
- Worker route `tierarztpraxis-schaffer.telacore.org/api/*`.

- [ ] Ressourcen-IDs eintragen: D1-ID eingetragen; R2 fehlt wegen API-Code `10042`.
- [ ] R2 `r2.dev` deaktiviert lassen: ohne aktiviertes R2 und Bucket noch nicht nachweisbar.
- [ ] R2 Lifecycle 60 Tage: ohne aktiviertes R2 und Bucket noch nicht anlegbar.
- [x] Development-Secret-Namen deklarieren, noch keine Werte setzen:
  - `TOKEN_PEPPER`;
  - `SESSION_PEPPER`;
  - `ACCESS_TEAM_DOMAIN`;
  - `ACCESS_ADMIN_API_AUD`.
- [x] Development deploy dry-run.
- [x] Commit:

```bash
git commit -m "chore: d1 r2 queues und same-origin-api konfigurieren"
```

**Zwischenstand 2026-08-04 – teilweise/blockiert:** Die D1-Datenbank `tierarztpraxis-schaffer-transfer-development` wurde mit EU-Jurisdiktion erstellt und als `TRANSFER_DB` mit ID `27da967d-21c2-4a37-98a1-9e6cfd7451a1` konfiguriert. Hauptqueue `tierarztpraxis-transfer-notifications-development` und DLQ `tierarztpraxis-transfer-notifications-dlq-development` wurden erstellt; Development enthält Producer, Consumer und DLQ-Zuordnung ohne Tuningwerte. Same-Origin-Route `tierarztpraxis-schaffer.telacore.org/api/*`, Cron `0 3 * * *` UTC, vier zusätzliche Secret-Namen sowie das vorgesehene lokale R2-Binding sind konfiguriert. Wrangler-Typen sind regeneriert; `worker:check`, 22 Worker-Tests, 65 Website-Tests und Development-Dry-run sind grün. Das einmalige erneute EU-R2-Listing scheiterte weiterhin mit API-Code `10042`; deshalb erfolgte kein R2-Create-Versuch. Bucket, private `r2.dev`-/Custom-Domain-Nachweise und 60-Tage-Lifecycle fehlen weiterhin. Es gab kein Deployment, keine Production-Änderung und keine Secret-Wert-Mutation. Task 13 bleibt offen; Task 14 kann auf D1 aufbauen.

---

## Task 14: D1-Migration

**Dateien:**

- Create: `worker/migrations/0001_datatransfer.sql`
- Create: `worker/test/schema.test.ts`
- Modify: `worker/package.json`

**Scripts:**

```json
{
  "scripts": {
    "d1:migrate:local": "wrangler d1 migrations apply TRANSFER_DB --local --env development",
    "d1:migrate:development": "wrangler d1 migrations apply TRANSFER_DB --remote --env development"
  }
}
```

- [x] Schema-Test anlegen.
- [x] Migration lokal anwenden.
- [x] Constraints und Indizes testen.
- [ ] Migration gegen Development nach manueller Bestätigung anwenden.
- [x] Backup/Time-Travel-Eintrag dokumentieren.
- [x] Commit:

```bash
git commit -m "feat: d1-schema für datentransfer anlegen"
```

**Zwischenstand 2026-08-04 – lokal fertig, Remote-Freigabe ausstehend:** Die Migration `0001_datatransfer.sql` bildet §17 mit neun Fachtabellen und sechs benannten Indizes ab. `transfer_submissions.case_id` referenziert `transfer_cases(id) ON DELETE CASCADE`; damit entfernt eine Falllöschung auch Submissions und deren abhängige Dateien und Links, während Audit-Ereignisse gemäß Schema mit `case_id = NULL` erhalten bleiben. Der ausführbare Schema-Test wendet die Migration über Wrangler in isoliertem lokalen State an und belegt Tabellen, Indizes, Status-/Boolean-/Längen-/Größenchecks, eindeutige `public_id`/Token-HMACs, Foreign-Key-Rejection, die vollständige Löschkaskade und einen zweiten idempotenten Migrationslauf. Der dokumentierte lokale Paketlauf führte 17 SQL-Befehle erfolgreich aus; `d1 migrations list` meldete anschließend keine offene Migration. `worker:check`, 27 Worker-Tests und 65 Website-Tests sind grün. Der read-only geprüfte Development-D1-Stand bleibt unverändert bei null Tabellen in EU-Jurisdiktion; aktueller Time-Travel-Bookmark: `00000001-00000000-000050bd-098c67ca6b334390ef3948b650c190ea`. Ohne neue manuelle Bestätigung wurde keine Remote-Migration angewandt und kein Restore, Deployment oder Production-Zugriff ausgeführt. Task 14 bleibt bis zum bestätigten Remote-Lauf teilweise offen.

**Fixrunde 1:** §15.1 und §15.4 erfordern eine interne Fallnotiz und eine interne Rückrufnotiz. `transfer_cases` enthält deshalb nun die nullable Felder `internal_note` und `callback_note`, jeweils mit maximal 4.000 Zeichen. RED: der reale Wrangler-Schematest scheiterte mit `table transfer_cases has no column named internal_note`; GREEN: beide Felder akzeptieren 4.000 Zeichen und verwerfen 4.001 Zeichen, gezielter Schematest 5/5. Beide Felder bleiben ausschließlich Admin/Server und sind für Public-DTOs sowie Customer-API-Antworten gesperrt. Keine weiteren Schema- oder API-Änderungen.

---

## Task 15: Token-, HMAC- und Sessionlogik

**Dateien:**

- Create: `worker/src/security/hmac.ts`
- Create: `worker/src/security/csrf.ts`
- Create: `worker/src/transfers/tokens.ts`
- Create: `worker/src/transfers/sessions.ts`
- Test: `worker/test/token.test.ts`, `worker/test/session.test.ts`

- [ ] Tokenparser-Failing Tests:
  - falsche Version;
  - zu kurzer Secretteil;
  - Whitespace;
  - zusätzlicher Punkt;
  - abgelaufen;
  - widerrufen.
- [ ] HMAC-Helfer.
- [ ] konstante Vergleichsfunktion.
- [ ] Sessioncookie.
- [ ] CSRF-Rotation.
- [ ] kein Token in Logs.
- [ ] Tests in Workers Runtime.
- [ ] Commit:

```bash
git commit -m "feat: sichere datentransfer-tokens und sessions"
```

---

## Task 16: Public Session- und Case-API

**Dateien:**

- Create: `worker/src/transfers/routes-public.ts`
- Create: `worker/src/security/turnstile.ts`
- Create: `worker/src/transfers/cases.ts`
- Test: `worker/test/transfer-api.test.ts`

- [ ] `POST /api/transfers/session`;
- [ ] Turnstile action `datatransfer_session`;
- [ ] Origin und Rate Limit;
- [ ] generische Tokenfehler;
- [ ] Sessioncookie und CSRF;
- [ ] Fragment wird nicht serverseitig verarbeitet;
- [ ] `GET /api/transfers/case`;
- [ ] nur kundenlesbare Daten;
- [ ] Tests.
- [ ] Commit:

```bash
git commit -m "feat: öffentliche session- und fall-api für datentransfer"
```

---

## Task 17: Berichte und Links

**Dateien:**

- Create: `worker/src/transfers/submissions.ts`
- Create: `worker/src/transfers/links.ts`
- Test: `worker/test/submissions.test.ts`

- [ ] Text- und Feldgrenzen;
- [ ] `https:`-Links;
- [ ] keine serverseitige Linkvorschau;
- [ ] Quotenreservierung;
- [ ] Status `draft`;
- [ ] Finalisierung erst nach Uploads;
- [ ] Notfallbestätigung erforderlich;
- [ ] Tests für IDOR und Quoten.
- [ ] Commit:

```bash
git commit -m "feat: fallberichte und sichere links speichern"
```

---

## Task 18: Streaming-Uploads nach R2

**Dateien:**

- Create: `worker/src/transfers/uploads.ts`
- Create: `worker/src/transfers/file-signatures.ts`
- Create: `worker/src/transfers/limits.ts`
- Test: `worker/test/upload.test.ts`

- [ ] Magic-Byte-Tabellentests;
- [ ] fehlendes oder falsches `Content-Length`;
- [ ] MIME-Widerspruch;
- [ ] mehrfache Slotnutzung;
- [ ] Stream-Upload;
- [ ] R2-Rollback bei D1-Fehler;
- [ ] Quoten atomar aktualisieren;
- [ ] verwaiste Objekte markieren;
- [ ] Tests mit R2-Testbinding.
- [ ] Commit:

```bash
git commit -m "feat: bilder und videos sicher nach r2 streamen"
```

---

## Task 19: Geschützte Dateiantwort und Video-Range

**Dateien:**

- Create: `worker/src/transfers/file-response.ts`
- Test: `worker/test/file-response.test.ts`

- [ ] Kunden-Sessionauth;
- [ ] Admin-Accessauth;
- [ ] IDOR-Test;
- [ ] `Range` für MP4/WebM;
- [ ] `206`, `Content-Range`, `Accept-Ranges`;
- [ ] `nosniff`;
- [ ] `inline` nur bei `inline_safe`;
- [ ] sonst Attachment;
- [ ] kein Cache.
- [ ] Commit:

```bash
git commit -m "feat: transferdateien geschützt und range-fähig ausliefern"
```

---

## Task 20: Öffentliche Datentransferseite

**Dateien:**

- Create: `src/pages/datentransfer/index.astro`
- Create: `src/layouts/TransferLayout.astro`
- Create: `src/components/datentransfer/TransferEntry.astro`
- Create: `src/components/datentransfer/TransferReportForm.astro`
- Create: `src/components/datentransfer/TransferUploadList.astro`
- Create: `src/components/datentransfer/TransferThread.astro`
- Create: `src/scripts/transfer-client.ts`
- Create: `src/styles/datentransfer.css`
- Test: `tests/transfer-client.test.ts`, `tests/e2e/datentransfer.spec.ts`

- [ ] Notfallwarnung vor Tokenfeld.
- [ ] Fragment lesen, Token austauschen, Fragment entfernen.
- [ ] Sessionstatus.
- [ ] Formular und Datei-Auswahl.
- [ ] Uploadfortschritt mit `XMLHttpRequest`, weil Fetch keinen stabilen Uploadprogress liefert.
- [ ] Einzelretry.
- [ ] Finalisierung.
- [ ] Thread.
- [ ] Sessionlogout.
- [ ] keine Tokenpersistenz in `localStorage`.
- [ ] `sessionStorage` nur für CSRF.
- [ ] axe und Tastatur.
- [ ] Commit:

```bash
git commit -m "feat: kundenseite für sicheren datentransfer"
```

---

## Task 21: Access-JWT und Admin-API

**Dateien:**

- Add dependency: `jose`
- Create: `worker/src/security/access-jwt.ts`
- Create: `worker/src/transfers/routes-admin.ts`
- Test: `worker/test/access.test.ts`

- [ ] ungültiger Header;
- [ ] falscher Issuer;
- [ ] falsche Audience;
- [ ] abgelaufen;
- [ ] gültige Admin-E-Mail;
- [ ] JWKS-Caching;
- [ ] lokale Testschlüssel;
- [ ] `GET /api/admin/session`.
- [ ] Commit:

```bash
git commit -m "feat: admin-api mit cloudflare-access-jwt absichern"
```

---

## Task 22: Admin-Dashboard und Token-Erzeugung

**Dateien:**

- Create: `src/pages/admin/datentransfer/index.astro`
- Create: `src/components/datentransfer/AdminTokenForm.astro`
- Create: `src/components/datentransfer/AdminCaseList.astro`
- Create: `src/components/datentransfer/AdminCaseDetail.astro`
- Create: `src/scripts/admin-transfer-client.ts`
- Test: `tests/e2e/admin-datentransfer.spec.ts`

- [ ] Access-Shell ohne sensible statische Daten.
- [ ] Fall erzeugen.
- [ ] Token einmal anzeigen.
- [ ] Copy-Link.
- [ ] Druckansicht.
- [ ] Liste und Filter.
- [ ] Detailansicht.
- [ ] Token widerrufen/rotieren.
- [ ] Status setzen.
- [ ] `in Praxisakte übernommen`.
- [ ] keine Aktion ohne Access-JWT.
- [ ] Commit:

```bash
git commit -m "feat: access-geschütztes admin-dashboard für datentransfer"
```

---

## Task 23: Antworten und Rückrufstatus

**Dateien:**

- Create: `worker/src/transfers/replies.ts`
- Create: `src/components/datentransfer/AdminReplyForm.astro`
- Modify: `TransferThread.astro`
- Test: `worker/test/replies.test.ts`, `tests/e2e/datentransfer.spec.ts`

- [ ] Antwort optional.
- [ ] Textgrenze 8.000.
- [ ] Status `callback_planned` ohne Antwort.
- [ ] Kundenthread zeigt Antwort und Status.
- [ ] keine internen Notizen.
- [ ] Benachrichtigungswunsch respektieren.
- [ ] Commit:

```bash
git commit -m "feat: optionale praxisantwort und rückrufstatus"
```

---

## Task 24: Queue-Benachrichtigungen

**Dateien:**

- Create: `worker/src/transfers/notifications.ts`
- Create: `worker/src/queue/consumer.ts`
- Modify: `worker/src/index.ts`
- Test: `worker/test/notifications.test.ts`

- [ ] Notification-D1-Zeile zuerst;
- [ ] Queue-Nachricht nur mit ID;
- [ ] Praxis-Mail minimal;
- [ ] Kunden-Mail ohne Token und Antwort;
- [ ] Retry;
- [ ] DLQ;
- [ ] Status in D1;
- [ ] Tests.
- [ ] Commit:

```bash
git commit -m "feat: datensparsame transfer-benachrichtigungen über queues"
```

---

## Task 25: Löschung, Lifecycle und Reconciliation

**Dateien:**

- Create: `worker/src/transfers/cleanup.ts`
- Create: `worker/src/scheduled/maintenance.ts`
- Modify: `worker/wrangler.jsonc`
- Test: `worker/test/cleanup.test.ts`
- Create: `docs/DATENTRANSFER-BETRIEB.md`

- [ ] abgelaufene Sessions;
- [ ] Tokens;
- [ ] Drafts;
- [ ] verwaiste R2-Objekte;
- [ ] geschlossene Fälle;
- [ ] Notification-Reconciliation;
- [ ] R2-Lifecycle 60 Tage dokumentieren;
- [ ] D1-Time-Travel-Restoreübung;
- [ ] Commit:

```bash
git commit -m "feat: datentransfer automatisch bereinigen und überwachen"
```

---

## Task 26: Datenschutz- und Rechtsseiten erweitern

**Dateien:**

- Modify: `src/pages/datenschutz/index.astro`
- Modify: `src/pages/impressum/index.astro`
- Create: `docs/DATENSCHUTZ-ENTSCHEIDUNGEN.md`
- Modify: `src/content/project-todos.ts`

- [ ] Verantwortlicher und Zweck.
- [ ] Token, D1, R2, Access, Queue und Mail beschreiben.
- [ ] Aufbewahrung als noch freizugebende Entscheidung.
- [ ] Betroffenenrechte.
- [ ] kein Notfall.
- [ ] Portal keine offizielle Akte, solange Übernahmeprozess nicht freigegeben.
- [ ] Rechtstext deutlich als Arbeitsfassung.
- [ ] Produktionsblocker bleiben offen.
- [ ] Commit:

```bash
git commit -m "docs: datenschutz und rechtsentscheidungen für transfer ergänzen"
```

---

## Task 27: Vollständiges Test- und Sicherheitsgate

**Testmatrix:**

- Home 1–4 Desktop/Mobil.
- Dropdown Maus/Tastatur.
- `/todo/`.
- Token gültig/ungültig/abgelaufen/widerrufen.
- Token nie in Log.
- Session und CSRF.
- Origin.
- Turnstile.
- Berichtgrenzen.
- Linkprotokoll.
- alle Dateitypen.
- MIME-Mismatch.
- 50-MB-Grenze.
- Fallquote.
- IDOR Kunde.
- IDOR Admin.
- Access-JWT.
- Range.
- Queue-Retry.
- Cleanup.
- Datenschutzheaders.
- Contact-Regression.
- CSP-Artefakte.
- `noindex` für Varianten/TODO/Admin/Datentransfer während Entwicklung.
- axe.
- 400-Prozent-Reflow.

**CI-Kommandos:**

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm check
pnpm worker:check
pnpm test
pnpm build
pnpm playwright test
pnpm exec tsx scripts/inspect-contact-build.ts
pnpm exec tsx scripts/inspect-home-build.ts
pnpm exec tsx scripts/inspect-transfer-build.ts
pnpm exec tsx scripts/generate-todo-markdown.ts
git diff --exit-code
```

**Commit:**

```bash
git commit -m "test: startseiten todo und datentransfer vollständig gaten"
```

---

## Task 28: Development-Deployment und End-to-End-Abnahme

### 28.1 Reihenfolge

1. D1 Development migrieren.
2. R2 Development und Lifecycle prüfen.
3. Queue/Consumer deployen.
4. Access Apps einrichten.
5. Worker Development deployen.
6. Pages deployen.
7. Cache leeren oder Versionshash prüfen.
8. E2E-Test mit echtem Token.
9. Testdateien löschen.
10. D1-/R2-Zähler prüfen.
11. TODO-Status aktualisieren.
12. PR mit CodeRabbit und Qlty grün.
13. Merge nach `main`.

### 28.2 E2E-Szenario

- Admin loggt über Access OTP ein.
- Admin erstellt Fall `Testtier`.
- Token wird einmal angezeigt.
- Link in privatem Browserfenster öffnen.
- Tokenfragment verschwindet.
- Bericht mit JPEG und kurzem MP4.
- Praxis-Mail trifft ohne Berichtstext ein.
- Admin sieht Bericht.
- Admin setzt `Rückruf geplant`.
- Kunde sieht Status.
- Admin schreibt Antwort.
- Kunde sieht Antwort.
- Fall als exportiert markieren.
- Fall schließen.
- Testfall manuell löschen.
- R2 und D1 sind leer.
- Audit enthält nur technische Ereignisse.

### 28.3 Meilenstein-2-Abnahmekriterien

- vier Startseiten auswählbar;
- Startseite 4 auf `/`;
- TODO-Seite aktuell;
- E-Mailkontakt unverändert funktionsfähig;
- Token und Upload funktionieren;
- Admin kann antworten oder Rückruf markieren;
- keine Secrets/Token in Logs;
- keine öffentlichen R2-Dateien;
- alle Tests grün;
- Development bleibt `noindex`;
- Produktionsblocker klar sichtbar.

---

## Task 29: Produktionsfreigabegate

Dieser Task wird erst begonnen, wenn Meilenstein 2 vollständig abgenommen ist.

- [ ] sämtliche P0-TODOs schließen;
- [ ] Rechtsfreigabe;
- [ ] Aufbewahrungsentscheidung;
- [ ] D1/R2 Production in EU;
- [ ] Production Access;
- [ ] Production Turnstile;
- [ ] Production Token-/Session-Secrets;
- [ ] Production Queue;
- [ ] Production R2 Lifecycle;
- [ ] Test ohne reale Kundendaten;
- [ ] Incident- und Restoreübung;
- [ ] `SITE_DEPLOYMENT_MODE=production`;
- [ ] `ALLOW_PLACEHOLDERS=false`;
- [ ] `PUBLIC_EXPOSE_TODO_PAGE` nach Entscheidung;
- [ ] Produktionsbuild ohne offenen Blocker;
- [ ] formale Freigabe dokumentieren.

---

## 24. Rollbackstrategie

### Website

- GitHub Pages auf vorherigen erfolgreichen Artifact-Deploy zurücksetzen;
- alternativ PR-Revert;
- Varianten sind rein statisch und berühren das Kontaktformular nicht direkt.

### Worker

- vorherige Worker-Version aktivieren;
- D1-Migrationen sind vorwärtskompatibel zu planen;
- destruktive Migrationen sind in Meilenstein 2 verboten;
- Featureflag `DATATRANSFER_ENABLED=false` schaltet Transfer-Routen auf kontrollierte Wartungsantwort;
- bestehendes `/v1/contact` bleibt aktiv.

### Datentransfer

- bei Störung Uploads deaktivieren;
- bestehende Dateien privat erhalten;
- Adminzugriff lesend belassen;
- Telefonkontakt und bestehendes Kontaktformular prominent anzeigen;
- Queue kann später reconciliert werden;
- nie zur Fehlerbehebung R2 öffentlich machen.

---

## 25. Offene Architekturentscheidungen mit Default

| Entscheidung | Default in diesem Plan | Änderbar bis |
|---|---|---|
| Nummerierung der Previews | bisherige Seite = 1, neue Previews = 2–4, Preview 3 = Startseite 4/Standard | vor Task 5 |
| Admin-Shell | statisch auf GitHub Pages, Daten ausschließlich über Access-API | vor Task 22 |
| Same-origin Transfer-API | `/api/*` Worker Route | vor Task 13 |
| Max. Video | 50 MB | vor Task 18 |
| Max. Fallvolumen | 100 MB | vor Task 18 |
| Tokenablauf | 14 Tage, max. 30 | vor Task 15 |
| Portalaufbewahrung | 30 Tage nach Schließen, 60-Tage-R2-Backstop | rechtliche Freigabe vor Produktion |
| Antworten | optional, Rückrufstatus gleichwertig | fest |
| E-Mailinhalt | keine Berichte/Anhänge | fest |
| Malware-Scanning | im MVP nicht behauptet; sichere Typen und private Bereitstellung | vor Produktion erneut bewerten |
| PDF-Uploads | im MVP nicht erlaubt | späterer Meilenstein |
| Generierte Personenbilder | nur Symbolbild, nie echtes Team | fest |
| TODO-Seite | öffentlich noindex, ohne Secrets | vor Produktion erneut entscheiden |

---

## 26. Definition of Done – Gesamtprojekt nach Meilenstein 2

### Design

- alle vier Varianten existieren;
- Standard ist Variante 4;
- Start-Dropdown funktioniert mit Maus und Tastatur;
- mobile Navigation funktioniert;
- Texte sind lebendiger, ohne Leistungen zu erfinden;
- Bilder sind optimiert und nachgewiesen;
- generierte Menschen sind als Symbolbild gekennzeichnet;
- keine falschen Adressen oder Telefonnummern in Bildern.

### TODO

- `/todo/` zeigt sämtliche nicht geheimen Aufgaben;
- Registry und Markdown sind synchron;
- Produktionsblocker sind maschinenlesbar;
- Historie H0–H16 ist enthalten;
- interne Secrets werden nicht gerendert.

### Datentransfer

- Admin erzeugt Token;
- Token wird nur einmal angezeigt;
- Kunde übermittelt Text, Bilder, Videos und HTTPS-Links;
- private R2-Speicherung;
- D1-Metadaten;
- Session, CSRF, Turnstile, Rate Limit;
- Admin sieht Einreichung;
- optionaler Antworttext;
- Rückrufstatus;
- minimale E-Mails;
- Löschung und Reconciliation;
- Access-JWT validiert;
- IDOR-Tests grün.

### Qualität

- bestehender E-Mailkontakt bleibt funktional;
- alle CI-Schritte grün;
- CodeRabbit und Qlty ohne offene Blocker;
- keine kritischen oder schweren axe-Befunde;
- CSP bleibt ohne `unsafe-inline`;
- Lockfile unverändert nach Installation;
- keine Secrets im Repository;
- R2/D1 EU-Jurisdiktion nachgewiesen;
- Development bleibt `noindex`.

---

## 27. Quellenbasis, Stand 2026-08-04

Die Planung stützt sich auf die jeweils aktuellen offiziellen Dokumentationen:

- Cloudflare Workers – Limits und Pricing;
- Cloudflare R2 – Pricing, private Buckets, Uploads, Lifecycle und EU-Jurisdiktion;
- Cloudflare D1 – Pricing, Limits, Migrationen, lokale Entwicklung und EU-Jurisdiktion;
- Cloudflare Queues – Free-Tier-Pricing, Retention und Consumer;
- Cloudflare Access – Policies, OTP, Authorization Cookie und JWT-Validierung;
- Cloudflare Workers – Routes und Wrangler-Konfiguration;
- Cloudflare Workers – Vitest Integration;
- GitHub Pages – Custom Domains und Actions Deployment;
- EUR-Lex – DSGVO, insbesondere Grundsätze, Informationspflicht, Auftragsverarbeitung, Privacy by Design und Sicherheit;
- BfDI – Standard-Datenschutzmodell und Stand der Technik.

---

## 28. Ausführungshandoff

Der Plan ist in drei unabhängig reviewbare Arbeitsstränge geteilt:

1. **Startseiten und Designsystem** – Tasks 1 bis 11;
2. **Datentransfer und Admin** – Tasks 12 bis 25;
3. **Integration, Recht und Deployment** – Tasks 26 bis 29.

Empfohlener Ablauf:

- Strang 1 zuerst bis zu einem grünen Design-PR;
- parallel Cloudflare-Ressourcen für Strang 2 nur in Development erstellen;
- Worker-Refactoring separat mergen, bevor D1/R2-Funktionen hinzukommen;
- Datentransfer in mehreren kleinen PRs;
- erst nach kompletter E2E-Abnahme `main`;
- Produktionsfreigabe als eigener, explizit genehmigter Meilenstein.

Der nächste unmittelbar ausführbare Schritt ist **Task 1**; dessen Archivinput ist bereits verifiziert.
