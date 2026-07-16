# Umsetzungsplan – Website der Tierarztpraxis Dr. Schäffer

**Repository:** `H234598/tierarztpraxis_schaffer`  
**Status:** Bootstrap- und Einrichtungsphase  
**Technik:** Astro, TypeScript, CSS, GitHub Pages und Cloudflare Workers  
**Grundsatz:** kein Java, keine erfundenen Praxisangaben, produktive Builds nur
mit bestätigten Pflichtdaten

## 1. Zielbild

Die Website wird als schnelle statische Astro-Seite gebaut und über GitHub
Pages veröffentlicht. Cloudflare übernimmt DNS, TLS, Weiterleitungen,
Sicherheitsregeln, Turnstile, Workers KV und den Worker für das
Kontaktformular.

```text
Besucherin oder Besucher
        │
        ├── tierarztpraxis-schaffer.telacore.org
        │         │
        │         ├── Cloudflare DNS, TLS, Redirects und Security Header
        │         └── GitHub Pages
        │                    └── statische Astro-Website
        │
        └── api.tierarztpraxis-schaffer.telacore.org/v1/contact
                  │
                  └── Cloudflare Worker
                         ├── Origin- und Eingabeprüfung
                         ├── Honeypot und Mindest-Ausfüllzeit
                         ├── Rate Limit
                         ├── Turnstile-Verifizierung
                         ├── Empfänger aus Workers KV
                         └── E-Mail an eine verifizierte Zieladresse
```

Die Startseite beantwortet zuerst:

1. Wie erreiche ich die Praxis?
2. Wann ist geöffnet?
3. Was ist in einem Notfall zu tun?
4. Wo liegt die Praxis?
5. Wie stelle ich eine normale Anfrage?

Die Telefonnummer erscheint im Kopfbereich, im Hero, im Notfallbereich, bei
den Sprechzeiten, im Footer und mobil in einer Schnellaktionsleiste.

## 2. Adressen und GitHub Pages

| Zweck | Adresse | Rolle |
|---|---|---|
| Website | `https://tierarztpraxis-schaffer.telacore.org` | kanonische Adresse |
| Alias | `https://tierarztpraxisschaffer.telacore.org` | permanente Weiterleitung |
| GitHub-Projektseite | `https://h234598.github.io/tierarztpraxis_schaffer/` | Entwicklung und Fallback |
| API | `https://api.tierarztpraxis-schaffer.telacore.org` | Worker Custom Domain |
| Repository | `H234598/tierarztpraxis_schaffer` | Quellcode und Deployments |

GitHub stellt für ein Projekt-Repository keine eigene technische Subdomain wie
`projekt.h234598.github.io` bereit. Die repository-spezifische GitHub-Adresse
ist ein Pfad. Die öffentliche Subdomain wird diesem konkreten Repository als
Custom Domain zugeordnet. Ihr CNAME zeigt technisch auf `h234598.github.io`;
GitHub ordnet die Anfrage anhand des Hostnamens der richtigen Pages-Site zu.
Weitere Repositories desselben Accounts können eigene Custom Domains verwenden.

Unterstrichvarianten werden nicht als öffentliche HTTPS-Hostnamen eingesetzt.

## 3. Technische Entscheidungen

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Frontend | Astro mit strengem TypeScript | statische Ausgabe und wenig JavaScript |
| Styling | modernes CSS mit Custom Properties und Layers | kein schweres UI-Framework |
| Paketmanager | pnpm | reproduzierbare Installation |
| Hosting | GitHub Pages | kostenlos und passend zum Repository |
| Deployment | GitHub Actions | automatisierter und prüfbarer Build |
| DNS und Edge | Cloudflare Free Tier | TLS, Redirects, Header, Worker und Turnstile |
| Formular | Cloudflare Worker | kein eigener Server nötig |
| Spam-Schutz | Honeypot, Ausfüllzeit, Rate Limit und Turnstile | mehrschichtiger Schutz |
| Empfänger | Workers KV | ohne Änderung des Worker-Codes austauschbar |
| Karte | direkter OpenStreetMap-Embed | ausdrücklich gewünschte unmittelbare Anzeige |
| Datenbank | keine Formulardatenbank | Datenminimierung |
| Tests | Vitest, Astro Check, später Playwright und axe | Funktion und Barrierefreiheit |

## 4. Workers KV statt Durable Object

Die Empfängeradresse ist eine einzelne, selten geänderte Konfiguration. Sie
benötigt keine Sitzungen und keine serialisierten Schreibvorgänge. Ein Durable
Object wäre hierfür unnötig komplex.

Verwendet werden zwei getrennte KV-Namespaces mit jeweils einem Schlüssel:

```text
contact:recipient:development
contact:recipient:production
```

Vorteile:

- Empfängerwechsel ohne Änderung des Worker-Quellcodes;
- klare Trennung von Entwicklung und Produktion;
- Verwaltung über Dashboard oder Wrangler;
- kein öffentlicher Konfigurationsendpunkt;
- der Browser übermittelt niemals eine Empfängeradresse.

KV ist global verteilt und Änderungen sind nicht überall augenblicklich
sichtbar. Eine kurze Propagationsverzögerung ist für einen seltenen
Empfängerwechsel akzeptabel. Produktion fällt niemals auf die Testadresse
zurück.

## 5. Entwicklungs- und Produktionsversand

### Entwicklung

Das Entwicklungsformular versendet echte E-Mails ausschließlich an:

```text
tierarztpraxis_schaffer@herr-der-mails.de
```

Ablauf:

1. `contact:recipient:development` aus KV lesen;
2. Wert streng als E-Mail-Adresse validieren;
3. solange KV noch nicht eingerichtet ist, nur in Entwicklung die feste
   Testadresse als Fallback verwenden;
4. Empfänger nie aus der Browseranfrage übernehmen.

### Produktion

Produktion liest ausschließlich `contact:recipient:production`. Eine fehlende
oder ungültige Adresse blockiert den Versand. Es gibt keinen Test-Fallback.

Cloudflare Email Service darf nur von einer eingerichteten Senderdomain senden.
Der geplante Absender lautet:

```text
website@tierarztpraxis-schaffer.telacore.org
```

Auf dem Workers-Free-Tarif werden nur verifizierte Zieladressen verwendet.

## 6. OpenStreetMap

Die Karte wird auf der Kontaktseite direkt als offizieller OSM-Embed geladen.

Gelieferte Koordinaten:

```text
N 49° 29.025'
E 010° 58.235'
```

Umgerechnet:

```text
49.483750, 10.9705833333
```

Anforderungen:

- Marker auf den gelieferten Koordinaten;
- sichtbare Anschrift oberhalb der Karte;
- Link zur größeren Karte und Routenplanung;
- sichtbare Attribution „© OpenStreetMap-Mitwirkende“;
- aussagekräftiger `iframe`-Titel;
- Telefonnummer, Adresse und Kartenlink bleiben unabhängig vom iframe nutzbar;
- Datenschutzhinweis erklärt die direkte Verbindung zu OpenStreetMap beim
  Seitenaufruf.

Ein Leaflet-Bundle ist für Version 1 nicht erforderlich.

## 7. Inhalte aus der alten Testseite

Übernommen werden ausschließlich sinnvolle Inhalte und Markenreferenzen:

- Praxisname;
- Telefonnummer;
- Anschrift;
- Öffnungszeiten;
- Eröffnungsdatum;
- Slogan und Tonalität;
- grüne, mintfarbene und botanische Bildsprache;
- Tier- und Pfotenmotiv;
- Instagram-Handle und Facebook-Seiten-ID;
- Eröffnungsplakat als historischer Rückblick.

Nicht übernommen werden Joomla-Core, altes Template-JavaScript, MHTML-
Laufzeitbestandteile, Sitzungsdaten, veraltete Aufbauhinweise oder unbestätigte
medizinische Leistungsversprechen.

Altangaben erhalten `legacy-unverified` und blockieren den Produktionsbuild,
bis sie bestätigt wurden.

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

FAQ und Stellenangebote sind verbindlich.

## 9. Bestätigte Zugänglichkeit der Praxis

**Quelle:** Bestätigung durch den Auftraggeber am 16. Juli 2026

- Die gesamte Praxis befindet sich im Erdgeschoss.
- Am Eingang befindet sich eine kleine Türschwelle.
- Die Eingangstür hat Standardbreite.
- Ein Aufzug wird nicht benötigt.
- Geeignete Parkplätze befinden sich unmittelbar vor der Praxis.
- Unterstützung durch das Team wird jederzeit gewährleistet.

Die Website verwendet deshalb nicht pauschal die Aussage „vollständig
barrierefrei“ oder „schwellenlos“. Sie beschreibt die Situation konkret und
empfiehlt bei individuellen Anforderungen einen kurzen Anruf vor dem Besuch.

Freigegebener Text:

> Die Praxis befindet sich vollständig im Erdgeschoss. Am Eingang ist eine
> kleine Türschwelle vorhanden; die Eingangstür hat Standardbreite. Ein Aufzug
> wird nicht benötigt. Geeignete Parkplätze befinden sich direkt vor der
> Praxis. Benötigen Sie beim Zugang oder während Ihres Besuchs Unterstützung,
> hilft Ihnen unser Team jederzeit gerne. Bitte rufen Sie uns bei besonderen
> Anforderungen vor Ihrem Besuch kurz an, damit wir Sie bestmöglich
> unterstützen können.

Noch zu ermitteln sind die lichte Türbreite, die genaue Schwellenhöhe, Angaben
zum Praxis-WC, Bewegungsflächen und Details zur barrierearmen ÖPNV-Anfahrt.
Nicht bestätigte Punkte bleiben Entwicklungsplatzhalter.

## 10. Digitale Barrierefreiheit

Qualitätsziel ist WCAG 2.2 auf Stufe AA. Eine Zertifizierung wird nicht
behauptet.

Geplant sind:

- semantisches HTML und korrekte Überschriftenfolge;
- Skip-Link zum Hauptinhalt;
- vollständige Tastaturbedienung;
- deutlich sichtbare Fokusmarkierungen;
- ausreichende Kontraste;
- vergrößerbare Texte und reflow-fähiges Layout;
- keine Information ausschließlich über Farbe;
- verständliche Formularbeschriftungen und Fehlerhinweise;
- Statusmeldungen über `aria-live`;
- Unterstützung von `prefers-reduced-motion`;
- Tests mit Tastatur, 200- und 400-Prozent-Zoom, Mobilgeräten,
  Screenreader-Stichprobe und axe-core.

Die FAQ weist sichtbar auf diese Bemühungen und auf einen Kontaktweg zum Melden
von Barrieren hin.

## 11. FAQ

Die FAQ nutzt native `<details>`-Elemente und funktioniert ohne zusätzliches
JavaScript.

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

## 12. Stellenangebote

Die Route `/stellenangebote/` bleibt immer erreichbar.

Ohne offene Stelle:

- ehrlicher Leerzustand;
- kein erfundener Personalbedarf;
- keine Initiativbewerbung über das allgemeine Kontaktformular;
- keine Lebenslauf-Uploads.

Mit aktiver Stelle:

- strukturierte und bestätigte Angaben;
- Veröffentlichungs- und Ablaufdatum;
- eigener Bewerbungsweg;
- Bewerbungsdatenschutz;
- `JobPosting`-Schema nur für aktive und verifizierte Einträge.

## 13. Kontaktformular

Felder:

- Name;
- E-Mail und/oder Telefonnummer;
- Anliegenkategorie;
- Nachricht mit maximal 2.000 Zeichen;
- Datenschutzhinweis;
- verstecktes Honeypot-Feld;
- Startzeitpunkt;
- Turnstile-Token.

Nicht vorgesehen sind Datei-Uploads, Befunde, Röntgenbilder, Notfallmeldungen,
frei wählbare Empfänger oder automatische Terminbestätigungen.

Worker-Ablauf:

1. nur `/v1/contact` akzeptieren;
2. exakte Origin-Allowlist prüfen;
3. nur `POST` und kontrolliertes `OPTIONS` zulassen;
4. JSON-Content-Type und maximal 8 KiB prüfen;
5. JSON sicher parsen und nur erlaubte Felder übernehmen;
6. Unicode normalisieren und Feldlängen begrenzen;
7. E-Mail-Header-Injection verhindern;
8. Honeypot und Mindest-Ausfüllzeit prüfen;
9. Rate-Limit-Schlüssel mit geheimem Salt hashen;
10. Turnstile serverseitig verifizieren;
11. Hostname und Aktion `contact_form` prüfen;
12. Empfänger serverseitig aus KV auflösen;
13. reine Text-E-Mail senden;
14. nur Request-ID, Ergebnis und Laufzeit protokollieren.

Name, Nachricht, E-Mail, Telefonnummer, Turnstile-Token und rohe IP-Adresse
werden nicht in Anwendungslogs geschrieben.

## 14. Entwicklungsmodus und Produktionssperre

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

- `production` zusammen mit `ALLOW_PLACEHOLDERS=true` ist immer ein Fehler;
- unbestätigte Pflichtwerte blockieren den Produktionsbuild;
- `TODO`, `TBD` und `CHANGEME` blockieren den Produktionsbuild;
- Entwicklung zeigt sichtbare Prüfhinweise und `noindex,nofollow`;
- Entwicklung verschickt echte E-Mails nur an die Testadresse;
- Produktion benötigt echte Turnstile-Schlüssel;
- Dokumentation und Tests werden nicht als Praxisinhaltsquelle gewertet.

## 15. Repository-Struktur

```text
tierarztpraxis_schaffer/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy-pages.yml
│       └── deploy-worker.yml
├── docs/
│   ├── ALTSEITEN-INVENTAR.md
│   ├── CLOUDFLARE-SETUP.md
│   ├── PRAXISDATEN.md
│   └── UMSETZUNGSPLAN.md
├── public/
├── scripts/
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

## 16. Cloudflare- und Pages-Einrichtung

Status der manuellen Einrichtung:

| Schritt | Aufgabe | Status |
|---:|---|---|
| 1 | GitHub Pages auf GitHub Actions stellen | erledigt |
| 2 | Custom Domain im Repository hinterlegen | erledigt |
| 3 | Website-CNAME auf `h234598.github.io` setzen | erledigt |
| 4 | Alias-Domain per 308 weiterleiten | offen |
| 5 | Development- und Production-KV anlegen | offen |
| 6 | KV-IDs in `worker/wrangler.jsonc` eintragen | offen |
| 7 | Development-Empfänger in KV schreiben | offen |
| 8 | Turnstile-Widget und Secrets anlegen | offen |
| 9 | getrennte Rate-Limit-Salts setzen | offen |
| 10 | Testziel und Senderdomain für E-Mail verifizieren | offen |
| 11 | Cloudflare-Secrets in GitHub-Environments hinterlegen | offen |
| 12 | Development-Worker manuell veröffentlichen und testen | offen |

Die genaue Klick- und Befehlsanleitung steht in
[`docs/CLOUDFLARE-SETUP.md`](CLOUDFLARE-SETUP.md).

## 17. CI und Deployments

Pull Requests prüfen mindestens:

```text
pnpm format:check
pnpm check
pnpm test
pnpm worker:check
pnpm build
```

GitHub Pages wird nur aus `main` veröffentlicht. Der Worker-Deploy wird manuell
über ein geschütztes GitHub-Environment gestartet. Er blockiert, solange
KV-ID-Platzhalter oder notwendige Secrets fehlen.

Produktionsrelevante Actions werden vor der Freigabe auf unveränderliche
Commit-SHAs gepinnt. Dependabot hält Abhängigkeiten und Actions aktuell.

## 18. Härtung

- statische Inhaltsseiten ohne Server-Runtime;
- keine Java-Komponenten;
- minimale Client-Skripte;
- keine Wildcard-CORS-Freigabe;
- keine Empfängeradresse aus dem Browser;
- keine Datei-Uploads;
- strikte Content Security Policy;
- `frame-src` nur für OpenStreetMap und Turnstile;
- `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`;
- Referrer-, MIME- und Permissions-Header;
- Secrets nur in Cloudflare oder GitHub Environments;
- getrennte Entwicklungs- und Produktionskonfiguration;
- keine personenbezogenen Anwendungslogs;
- Telefon-Fallback bei Worker- oder Mailausfall.

## 19. Umsetzungsphasen

### Phase 0 – Daten und Freigaben

Bestätigte Zugänglichkeitsangaben sind erfasst. Weiter offen sind insbesondere
Leistungen, Tierarten, Notdienst, öffentliche E-Mail, Team, Qualifikationen,
genaue Tür- und Schwellenmaße, Praxis-WC, ÖPNV-Angaben, Kammer,
Aufsichtsbehörde und Berufshaftpflicht.

### Phase 1 – Bootstrap

- Astro und TypeScript;
- zentrale Praxiskonfiguration;
- Entwicklungs-/Produktionsschalter;
- Inhaltsvalidator;
- CI und Pages-Workflow;
- Kontaktformular-Worker und Tests.

### Phase 2 – Seiten und Design

- responsive Navigation;
- prominente Telefonnummer;
- sämtliche Inhaltsseiten;
- FAQ und Stellenangebote;
- direkte OSM-Karte;
- Altmaterial als Marken- und Inhaltsreferenz.

### Phase 3 – Cloudflare

- Alias-Redirect;
- KV-Namespaces und Schlüssel;
- Turnstile;
- Rate Limit;
- E-Mail-Service;
- GitHub-Environment-Secrets;
- Development-Worker-Deploy.

### Phase 4 – Qualität und Produktion

- reale Inhalte bestätigen;
- Rechtstexte prüfen;
- Tastatur-, Zoom-, Screenreader- und Mobiltests;
- Formular-Smoke-Test;
- Produktionsbuild ohne Platzhalter;
- Indexierung freigeben.

## 20. Definition of Done

Die erste produktive Version ist fertig, wenn:

- alle Pflichtdaten bestätigt sind;
- kein `TODO` oder unbestätigter Pflichtwert verbleibt;
- die Telefonnummer sofort sichtbar und anklickbar ist;
- FAQ und Stellenangebote vollständig vorhanden sind;
- die FAQ digitale und physische Zugänglichkeit präzise beschreibt;
- Türschwelle und Teamunterstützung transparent genannt werden;
- die OSM-Karte direkt mit dem gelieferten Marker angezeigt wird;
- die Datenschutzseite den direkten OSM-Abruf beschreibt;
- Entwicklung echte E-Mails nur an die Testadresse sendet;
- Produktion den Empfänger nur aus dem Produktions-KV liest;
- der Browser keinen Empfänger beeinflussen kann;
- Turnstile serverseitig geprüft wird;
- keine personenbezogenen Inhalte protokolliert werden;
- keine Datei-Uploads möglich sind;
- Telefonkontakt auch bei API-Ausfall erhalten bleibt;
- Custom Domain, Alias, Canonical, Sitemap und HTTPS funktionieren;
- Website und Worker reproduzierbar gebaut und veröffentlicht werden können.

## 21. Referenzen

- GitHub Pages Custom Domains: `docs.github.com/pages/`
- Workers KV: `developers.cloudflare.com/kv/`
- Turnstile: `developers.cloudflare.com/turnstile/`
- Cloudflare Email Service: `developers.cloudflare.com/email-service/`
- Worker Custom Domains: `developers.cloudflare.com/workers/configuration/routing/custom-domains/`
- OpenStreetMap: `wiki.openstreetmap.org/wiki/Export`

---

**Nächster technischer Schritt:** Schritte 4 bis 11 aus
`docs/CLOUDFLARE-SETUP.md` durchführen, danach den Development-Worker über
GitHub Actions veröffentlichen und eine echte Testmail senden.
