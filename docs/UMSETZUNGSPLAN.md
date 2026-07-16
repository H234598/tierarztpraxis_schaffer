# Umsetzungsplan – Website der Tierarztpraxis Dr. Schäffer

**Repository:** `H234598/tierarztpraxis_schaffer`  
**Status:** Entwicklungs- und Testphase  
**Technik:** Astro, TypeScript, CSS, GitHub Pages und Cloudflare Workers  
**Grundsatz:** kein Java, keine erfundenen Praxisangaben, produktive Builds nur mit bestätigten Pflichtdaten

## 1. Zielbild

Die Website wird als statische Astro-Seite gebaut und über GitHub Pages veröffentlicht. Cloudflare übernimmt DNS, TLS, Weiterleitungen, Sicherheitsregeln, Turnstile und den Worker für das Kontaktformular.

```text
Besucherin oder Besucher
        │
        ├── tierarztpraxis-schaffer.telacore.org
        │         │
        │         ├── Cloudflare DNS, TLS, Redirects, Security Header
        │         │
        │         └── GitHub Pages
        │                    └── statische Astro-Website
        │
        └── api.tierarztpraxis-schaffer.telacore.org/v1/contact
                  │
                  └── Cloudflare Worker
                         ├── Origin- und Eingabeprüfung
                         ├── Honeypot und Mindest-Ausfüllzeit
                         ├── Turnstile-Verifizierung
                         ├── Rate Limit
                         ├── Empfänger aus Workers KV
                         └── E-Mail-Versand
```

Die Startseite beantwortet zuerst die praktischen Fragen:

1. Wie erreiche ich die Praxis?
2. Wann ist geöffnet?
3. Was ist in einem Notfall zu tun?
4. Wo liegt die Praxis?
5. Wie kann eine normale Anfrage gestellt werden?

Die Telefonnummer ist deshalb im Kopfbereich, im Hero, im Notfallbereich, bei den Sprechzeiten, im Footer und mobil in einer Schnellaktionsleiste sichtbar.

## 2. GitHub-Pages- und Domainstrategie

### 2.1 Technische Projektadresse

GitHub stellt für dieses Repository die Projektseiten-Adresse bereit:

```text
https://h234598.github.io/tierarztpraxis_schaffer/
```

Das ist ein repository-spezifischer **Pfad**, keine eigene GitHub-Subdomain. GitHub bietet für einzelne Projekt-Repositories keinen Zielhost nach dem Muster `tierarztpraxis-schaffer.h234598.github.io` an.

### 2.2 Öffentliche Subdomain

Im Repository wird als Custom Domain eingetragen:

```text
https://tierarztpraxis-schaffer.telacore.org
```

Der DNS-CNAME der öffentlichen Subdomain zeigt technisch auf:

```text
h234598.github.io
```

Das vermischt mehrere GitHub-Pages-Projekte nicht. GitHub ordnet den eingehenden Hostnamen derjenigen Site zu, in deren Repository genau diese Custom Domain konfiguriert ist. Weitere Repositories des Accounts können eigene Custom Domains erhalten.

### 2.3 Rollen der Domains

| Zweck | Adresse | Rolle |
|---|---|---|
| Website | `https://tierarztpraxis-schaffer.telacore.org` | kanonische Produktionsadresse |
| Alias | `https://tierarztpraxisschaffer.telacore.org` | permanente Weiterleitung auf die kanonische Adresse |
| GitHub-Projektseite | `https://h234598.github.io/tierarztpraxis_schaffer/` | Entwicklungs-/Fallback-Adresse |
| API | `https://api.tierarztpraxis-schaffer.telacore.org` | Worker Custom Domain |
| Repository | `H234598/tierarztpraxis_schaffer` | Quellcode und Deployments |

Unterstrichvarianten werden nicht als öffentliche HTTPS-Hostnamen verwendet.

### 2.4 Einrichtungsreihenfolge

1. `telacore.org` beziehungsweise die benötigte Subdomain bei GitHub verifizieren.
2. Im Repository unter **Settings → Pages** die Custom Domain `tierarztpraxis-schaffer.telacore.org` hinterlegen.
3. In Cloudflare den CNAME der Subdomain auf `h234598.github.io` setzen.
4. Zertifikatsausstellung abwarten und anschließend HTTPS erzwingen.
5. Alias-Domain per `301` oder `308` inklusive Pfad und Query weiterleiten.
6. Canonical-Tags, Sitemap und strukturierte Daten ausschließlich auf die kanonische Domain ausrichten.
7. Keine Wildcard-DNS-Einträge verwenden.

## 3. Verbindliche technische Entscheidungen

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Frontend | Astro mit TypeScript im Strict Mode | statische Ausgabe, sehr wenig Client-JavaScript |
| Styling | modernes CSS mit Custom Properties, Layers und Container Queries | kein schweres UI-Framework |
| Paketmanager | pnpm | reproduzierbare Installation |
| Hosting | GitHub Pages | kostenlos, stabil und passend zum Repository |
| Deployment | GitHub Actions | automatisierter und prüfbarer Build |
| DNS und Edge | Cloudflare Free Tier | TLS, Redirects, Header, Worker und Turnstile |
| Kontaktformular | Cloudflare Worker | kein eigener Server nötig |
| Spam-Schutz | Honeypot, Mindestzeit, Turnstile und Rate Limit | mehrschichtiger Schutz |
| Empfänger-Konfiguration | Workers KV | ohne Codeänderung austauschbar |
| Karte | direkt eingebettete OpenStreetMap-Karte | vom Auftraggeber ausdrücklich gewünscht |
| Tests | Vitest, Astro Check, spätere Playwright-/axe-Prüfungen | Funktion und Barrierefreiheit |
| Datenspeicherung | keine Formulardatenbank | Datenminimierung |

## 4. Warum Workers KV statt Durable Object?

Die Empfängeradresse ist eine einzelne, selten geänderte Konfiguration. Sie benötigt weder zustandsbehaftete Sitzungen noch koordinierte Schreibvorgänge. Ein Durable Object wäre dafür unnötig komplex und würde zusätzliche Klasse, Bindings und Lebenszykluslogik einführen.

Workers KV passt besser:

- Änderung ohne Anpassung oder Neubau des Worker-Quellcodes;
- getrennte Schlüssel je Umgebung;
- Verwaltung über Cloudflare Dashboard oder Wrangler;
- sehr schnelle, weltweit verteilte Lesezugriffe;
- kein öffentlicher Konfigurationsendpunkt erforderlich.

Geplante Schlüssel:

```text
contact:recipient:development
contact:recipient:production
```

Wichtige Eigenschaft: KV ist global verteilt und nicht für sofort konsistente, häufig koordinierte Änderungen gedacht. Ein Empfängerwechsel kann an einzelnen Standorten kurz verzögert sichtbar werden. Für eine selten geänderte E-Mail-Konfiguration ist das akzeptabel. Falls später sofortige globale Konsistenz oder komplexe Konfigurationszustände benötigt werden, kann auf ein Durable Object oder eine andere Konfigurationsquelle gewechselt werden.

Sicherheitsregeln:

- Das Frontend sendet niemals einen Empfänger mit.
- Es gibt keinen öffentlichen Endpunkt zum Ändern des KV-Werts.
- Produktions- und Entwicklungsschlüssel sind getrennt.
- Produktion fällt niemals auf die Testadresse zurück.
- Ungültige oder fehlende Produktionsadressen führen zu einem kontrollierten Fehler statt zu einem Versand an ein unerwartetes Ziel.

## 5. Entwicklungs- und Produktionsversand

### 5.1 Entwicklung

Das Entwicklungsformular versendet bereits echte E-Mails. Der Empfänger ist jedoch fest eingeschränkt auf:

```text
tierarztpraxis_schaffer@herr-der-mails.de
```

Auflösung im Worker:

1. Wert aus `contact:recipient:development` in KV lesen;
2. Wert streng als E-Mail-Adresse validieren;
3. solange KV noch nicht eingerichtet ist, ausschließlich in `development` auf die fest codierte Testadresse zurückfallen;
4. Empfänger nie aus der Browseranfrage übernehmen.

### 5.2 Produktion

In Produktion wird ausschließlich `contact:recipient:production` gelesen. Eine fehlende oder ungültige Adresse blockiert den Versand mit einer generischen Fehlermeldung. Die Testadresse ist dort kein Fallback.

### 5.3 Mailmodus

```dotenv
ENVIRONMENT=development
MAIL_DELIVERY=live
CONTACT_RECIPIENT_KEY=contact:recipient:development
TEST_CONTACT_RECIPIENT=tierarztpraxis_schaffer@herr-der-mails.de
```

Auch im Entwicklungsmodus bleibt Turnstile aktiv. Für lokale und automatisierte Tests werden die offiziellen Cloudflare-Testschlüssel genutzt; ein Produktionsbuild akzeptiert diese Testschlüssel nicht.

## 6. OpenStreetMap

Die Karte wird direkt und ohne Zwei-Klick-Sperre als offizieller OSM-Embed geladen.

Gelieferte Koordinaten:

```text
N 49° 29.025'
E 010° 58.235'
```

Umrechnung:

```text
Breitengrad: 49.483750
Längengrad: 10.9705833333
```

Umsetzung:

- direkter `iframe` auf `/kontakt/`;
- Marker auf den gelieferten Koordinaten;
- sichtbare Adresse oberhalb der Karte;
- großer externer Link für Karte und Routenplanung;
- sichtbare Attribution „© OpenStreetMap-Mitwirkende“;
- aussagekräftiger `title`;
- Adresse, Telefonnummer und Kartenlink funktionieren unabhängig vom iframe;
- Datenschutzhinweis erklärt, dass bereits beim Aufruf der Kontaktseite eine Verbindung zu OpenStreetMap entsteht.

Für Version 1 ist kein Leaflet-Bundle erforderlich.

## 7. Übernahme der alten Testseite

Aus dem ZIP werden ausschließlich sinnvolle Inhalte und Markenreferenzen übernommen:

- Praxisname;
- Telefonnummer;
- Anschrift;
- Öffnungszeiten;
- Eröffnungsdatum;
- Slogan und Tonalität;
- grüne, mintfarbene und botanische Bildsprache;
- Logo- beziehungsweise Tiermotiv als Grundlage eines sauberen Web-Assets;
- Instagram-Handle und Facebook-Seiten-ID;
- Eröffnungsplakat als historischer Rückblick.

Nicht übernommen werden:

- Joomla-Core und Template-JavaScript;
- altes CSS und Iconfont-Pakete;
- MHTML-Laufzeitbestandteile;
- Sitzungs- oder Formulardaten;
- zeitgebundene Aussagen wie „Homepage im Aufbau“;
- nicht bestätigte medizinische Leistungsversprechen.

Alle Altangaben erhalten einen Prüfstatus `legacy-unverified` und blockieren den Produktionsbuild, bis sie bestätigt wurden.

## 8. Seitenstruktur

```text
/
├── Leistungen
├── Praxis und Team
├── Sprechzeiten
├── Notfall
├── Kontakt und Anfahrt mit direkter OSM-Karte
├── FAQ
├── Stellenangebote
├── Barrierefreiheit
├── Impressum
├── Datenschutz
└── 404
```

FAQ und Stellenangebote sind verbindliche Bestandteile.

## 9. FAQ und Barrierefreiheit

Die FAQ verwendet native `<details>`-Elemente und funktioniert ohne zusätzliches JavaScript.

Verbindliche Fragen:

- Brauche ich einen Termin?
- Was soll ich in einem Notfall tun?
- Welche Tiere werden behandelt?
- Welche Leistungen werden angeboten?
- Was soll ich zum Termin mitbringen?
- Wie erreiche ich die Praxis und wo kann ich parken?
- Ist die Praxis barrierefrei erreichbar?
- Ist die Website barrierearm nutzbar?
- Können Befunde oder Bilder hochgeladen werden?
- Wo finde ich die Praxis in sozialen Netzwerken?

Die FAQ weist sichtbar darauf hin, dass die Website mit klarer Struktur, Tastaturbedienung, Fokusmarkierungen, Kontrasten, vergrößerbaren Texten, verständlichen Formularen und reduziertem Bewegungsumfang entwickelt wird. Qualitätsziel ist WCAG 2.2 AA; eine Zertifizierung wird nicht behauptet.

Bauliche Barrierefreiheit wird nur anhand konkreter, bestätigter Angaben beschrieben.

## 10. Stellenangebote

Die Route `/stellenangebote/` bleibt immer erreichbar.

Ohne offene Stelle:

- ehrlicher Leerzustand;
- kein erfundener Personalbedarf;
- keine Initiativbewerbung über das allgemeine Kontaktformular;
- keine Lebenslauf-Uploads.

Mit aktiver Stelle:

- strukturierte, bestätigte Daten;
- Ablaufdatum;
- eigener Bewerbungsweg;
- Bewerbungsdatenschutz;
- `JobPosting`-Schema nur für aktive und verifizierte Einträge.

## 11. Kontaktformular

### Felder

- Name;
- E-Mail und/oder Telefonnummer;
- Anliegenkategorie;
- Nachricht, maximal 2.000 Zeichen;
- Datenschutzhinweis;
- verstecktes Honeypot-Feld;
- Startzeitpunkt;
- Turnstile-Token.

Nicht vorgesehen:

- Datei-Uploads;
- Röntgenbilder und Befunde;
- allgemeine medizinische Dokumente;
- Notfallmeldungen;
- frei wählbarer Empfänger;
- automatische Terminbestätigung.

### Worker-Ablauf

1. nur `/v1/contact` akzeptieren;
2. exakte Origin-Allowlist prüfen;
3. nur `POST` und kontrollierte `OPTIONS` zulassen;
4. JSON-Content-Type und maximal 8 KiB prüfen;
5. JSON sicher parsen und nur erlaubte Felder übernehmen;
6. Unicode normalisieren und Längen begrenzen;
7. Header-Injection verhindern;
8. Honeypot und Mindest-Ausfüllzeit prüfen;
9. gehashten Rate-Limit-Schlüssel verwenden;
10. Turnstile serverseitig verifizieren;
11. erwarteten Hostnamen und Aktion prüfen;
12. Empfänger serverseitig aus KV auflösen;
13. reine Text-E-Mail senden;
14. nur Request-ID, Ergebnis und Laufzeit protokollieren.

Nicht protokolliert werden Name, Nachricht, E-Mail, Telefonnummer, Turnstile-Token oder rohe IP-Adresse.

## 12. Entwicklungsmodus und Pflichtwertprüfung

```dotenv
# Entwicklung
SITE_DEPLOYMENT_MODE=development
ALLOW_PLACEHOLDERS=true
PUBLIC_SITE_URL=https://h234598.github.io
PUBLIC_BASE_PATH=/tierarztpraxis_schaffer
```

```dotenv
# Produktion
SITE_DEPLOYMENT_MODE=production
ALLOW_PLACEHOLDERS=false
PUBLIC_SITE_URL=https://tierarztpraxis-schaffer.telacore.org
PUBLIC_BASE_PATH=/
```

Regeln:

- `production` plus `ALLOW_PLACEHOLDERS=true` ist immer ein Fehler;
- unbestätigte Pflichtwerte blockieren den Produktionsbuild;
- `TODO`, `TBD` und `CHANGEME` blockieren den Produktionsbuild;
- die Entwicklung zeigt sichtbare Prüfhinweise und `noindex,nofollow`;
- das Entwicklungsformular verschickt echte E-Mails ausschließlich an die Testadresse;
- Produktion benötigt ein echtes Turnstile-Sitekey;
- Dokumentation und Tests werden nicht als Inhaltsquelle validiert.

## 13. Repository-Skeleton

```text
tierarztpraxis_schaffer/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── deploy-pages.yml
│   │   └── deploy-worker.yml
│   ├── dependabot.yml
│   └── CODEOWNERS
├── docs/
│   ├── ALTSEITEN-INVENTAR.md
│   ├── CLOUDFLARE-SETUP.md
│   ├── GITHUB-PAGES-SETUP.md
│   └── UMSETZUNGSPLAN.md
├── public/
│   ├── assets/
│   ├── favicon.svg
│   └── site.webmanifest
├── scripts/
│   └── validate-content.ts
├── src/
│   ├── components/
│   ├── config/
│   ├── layouts/
│   ├── pages/
│   ├── styles/
│   └── utils/
├── tests/
└── worker/
    ├── src/
    ├── test/
    └── wrangler.jsonc
```

## 14. CI und Deployments

Jeder Pull Request prüft:

```text
pnpm format:check
pnpm check
pnpm test
pnpm worker:check
pnpm build
```

GitHub Pages wird ausschließlich aus `main` veröffentlicht. Der Worker-Deploy bleibt zunächst manuell und verweigert den Start, solange KV-IDs oder Secrets fehlen.

Produktionsrelevante GitHub-Actions werden vor Freigabe auf unveränderliche Commit-SHAs gepinnt. Dependabot hält diese Referenzen und npm-Abhängigkeiten aktuell.

## 15. Sicherheits- und Härtungsmaßnahmen

- statische Ausgabe ohne Server-Runtime für Inhaltsseiten;
- keine Java-Komponenten;
- minimale Client-Skripte;
- keine Wildcard-CORS-Freigabe;
- keine Empfängeradresse aus dem Browser;
- keine Datei-Uploads;
- strikte Content Security Policy;
- `frame-src` nur für OpenStreetMap und Turnstile;
- `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`;
- Referrer-, MIME- und Permissions-Header;
- Secrets ausschließlich in Cloudflare beziehungsweise GitHub Environments;
- Lockfile vor Produktionsfreigabe;
- Dependency- und Workflow-Updates durch Dependabot;
- getrennte Entwicklungs- und Produktionskonfiguration;
- keine personenbezogenen Anwendungslogs;
- klarer Telefon-Fallback bei Worker- oder Mailausfall.

## 16. Umsetzungsphasen

### Phase 0 – Daten und Freigaben

Nicht ermittelbare Angaben erhalten sichtbare Platzhalter. Zu klären sind insbesondere Leistungen, Tierarten, Notdienst, öffentliche E-Mail, Team, Qualifikationen, bauliche Barrierefreiheit, Parken, Kammer, Aufsichtsbehörde und Berufshaftpflicht.

### Phase 1 – Bootstrap

- Astro und TypeScript;
- zentrale Praxiskonfiguration;
- Entwicklungs-/Produktionsschalter;
- Inhaltsvalidator;
- CI und GitHub-Pages-Workflow;
- Worker-Skeleton.

### Phase 2 – Seiten und Design

- responsive Navigation;
- prominente Telefonnummer;
- Startseite;
- alle Inhaltsseiten;
- FAQ und Stellenangebote;
- direkte OSM-Karte;
- Altmaterial als Marken- und Inhaltsreferenz.

### Phase 3 – Kontakt-Backend

- KV-Empfängerkonfiguration;
- echter Entwicklungsversand an die Testadresse;
- Turnstile;
- Rate Limit;
- E-Mail-Binding;
- Tests für Missbrauchs- und Fehlerszenarien.

### Phase 4 – Cloudflare und Pages

- Domain verifizieren;
- Custom Domain im Repository setzen;
- DNS konfigurieren;
- Alias weiterleiten;
- Worker Custom Domain anlegen;
- KV-Namespace und Schlüssel einrichten;
- Secrets und E-Mail-Ziel verifizieren;
- Sicherheitsheader testen.

### Phase 5 – Qualität und Produktion

- reale Inhalte bestätigen;
- Rechtsseiten prüfen;
- Tastatur-, Zoom-, Screenreader- und Mobiltests;
- Formular-Smoke-Test;
- Produktionsbuild ohne Platzhalter;
- Indexierung freigeben.

## 17. Definition of Done

Die erste produktive Version ist fertig, wenn:

- alle Pflichtdaten bestätigt sind;
- kein `TODO` oder unbestätigter Pflichtwert im Produktionsbuild verbleibt;
- die Telefonnummer sofort sichtbar und anklickbar ist;
- FAQ und Stellenangebotsseite vollständig vorhanden sind;
- die FAQ digitale und physische Barrierefreiheit transparent behandelt;
- die OSM-Karte direkt mit dem gelieferten Marker angezeigt wird;
- die Datenschutzseite den direkten OSM-Aufruf beschreibt;
- das Entwicklungsformular echte E-Mails nur an die Testadresse sendet;
- Produktion den Empfänger ausschließlich aus dem Produktions-KV-Schlüssel liest;
- der Browser den Empfänger nicht beeinflussen kann;
- Turnstile ausschließlich serverseitig akzeptiert wird;
- keine personenbezogenen Inhalte protokolliert werden;
- kein Datei-Upload möglich ist;
- Telefonkontakt auch bei API-Ausfall erhalten bleibt;
- Custom Domain, Alias, Canonical, Sitemap und HTTPS korrekt funktionieren;
- Website und Worker reproduzierbar aus dem Repository gebaut werden können.

## 18. Referenzen

- GitHub Pages Custom Domains: `docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/`
- Cloudflare Workers KV: `developers.cloudflare.com/kv/`
- Cloudflare Durable Objects: `developers.cloudflare.com/durable-objects/`
- Cloudflare Turnstile Siteverify: `developers.cloudflare.com/turnstile/get-started/server-side-validation/`
- Cloudflare Email Service: `developers.cloudflare.com/email-service/`
- OpenStreetMap Embed und Attribution: `wiki.openstreetmap.org/wiki/Export` und `openstreetmap.org/copyright`

---

**Nächster technischer Schritt:** Das in diesem PR enthaltene Astro-/Worker-Gerüst durch CI bauen, anschließend KV-Namespace, Turnstile, E-Mail-Binding und GitHub-Pages-Custom-Domain in den jeweiligen Konten konfigurieren.