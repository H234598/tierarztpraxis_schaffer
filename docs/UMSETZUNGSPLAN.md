# Umsetzungsplan – Website der Tierarztpraxis Dr. Schäffer

**Repository:** `H234598/tierarztpraxis_schaffer`  
**Status:** überarbeiteter Plan, noch keine produktive Veröffentlichung  
**Technik:** Astro, TypeScript, CSS, GitHub Pages und bei Bedarf Cloudflare Workers  
**Grundsatz:** kein Java, keine unnötige Laufzeit, keine erfundenen Praxisangaben

## 1. Zielbild

Die Website wird eine schnelle, gut zugängliche und wartungsarme statische Website. Die eigentlichen Seiten werden mit Astro gebaut und über GitHub Pages veröffentlicht. Cloudflare übernimmt DNS, Weiterleitungen, Sicherheitsheader und das kleine Backend für das Kontaktformular.

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
                         ├── Eingabe- und Origin-Prüfung
                         ├── Honeypot- und Turnstile-Prüfung
                         ├── Missbrauchsschutz
                         └── E-Mail an die feste Testadresse
```

Die Website soll zuerst die praktischen Fragen beantworten: Wie erreiche ich die Praxis, wann ist geöffnet, was mache ich im Notfall und wie vereinbare ich einen Termin? Deshalb steht die Telefonnummer sichtbar im Kopfbereich, im Hero, im Notfallbereich und auf Mobilgeräten zusätzlich in einer Aktionsleiste.

## 2. Verbindliche technische Entscheidungen

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Frontend | Astro mit TypeScript im Strict Mode | statische Ausgabe, sehr wenig JavaScript, gute Wartbarkeit |
| Styling | modernes CSS mit Custom Properties, Layers und Container Queries | kein schweres UI-Framework nötig |
| Paketmanager | pnpm | reproduzierbare, schnelle Installationen |
| Hosting | GitHub Pages | kostenlos und passend zum Repository |
| Deployment | GitHub Actions | automatisierter, prüfbarer Build |
| Edge und DNS | Cloudflare Free Tier | TLS, Weiterleitungen, Header, Worker und Turnstile |
| Kontaktformular | Cloudflare Worker | kein dauerhaft laufender Server nötig |
| Spam-Schutz | Honeypot plus Cloudflare Turnstile | geringe Hürde für Menschen, bessere Bot-Abwehr |
| Karte | OpenStreetMap als Zwei-Klick-Karte | nutzbar, datensparsam und ohne Google-Abhängigkeit |
| Inhalte | zentrale TypeScript-Konfiguration plus Markdown/MDX | versionierbar und leicht prüfbar |
| Tests | Vitest, Playwright, axe-core und Lighthouse CI | Funktion, Barrierefreiheit und Performance |
| Datenspeicherung | standardmäßig keine Formulardatenbank | weniger Risiko und weniger Datenschutzaufwand |

## 3. Domains – korrigierte Produktionsstrategie

### 3.1 Kanonische Adressen

Für öffentliche Web-Hostnamen werden keine Unterstriche verwendet. Unterstriche sind zwar in manchen DNS-Kontexten zulässig, gehören aber nicht zur Syntax normaler Internet-Hostnamen und führen bei Browsern, Zertifikaten und Plattformen zu unnötigen Kompatibilitätsproblemen.

Daher gilt:

| Zweck | Adresse | Rolle |
|---|---|---|
| Website | `https://tierarztpraxis-schaffer.telacore.org` | kanonische Produktionsadresse |
| Alias | `https://tierarztpraxisschaffer.telacore.org` | permanente Weiterleitung auf die kanonische Adresse |
| API | `https://api.tierarztpraxis-schaffer.telacore.org` | Worker Custom Domain |
| Repository | `H234598/tierarztpraxis_schaffer` | Unterstrich ist hier unproblematisch |

Die ursprünglich genannten Varianten

- `tierarztpraxis_schaffer.telacore.org`
- `api.tierarztpraxis_schaffer.telacore.org`

werden nicht als Produktions-Hostnamen eingeplant. Sie können als interne Bezeichner dokumentiert werden, aber nicht als verlässliche HTTPS-Adressen.

### 3.2 Weiterleitungen und Canonicals

- Jede Alias-Domain antwortet mit `301` oder `308` auf die kanonische Domain.
- Pfad und Query-String bleiben erhalten.
- Nur die kanonische Domain steht in Canonical-Tags, Sitemap, Open Graph und strukturierten Daten.
- Die GitHub-Pages-Projektadresse bleibt als technischer Fallback vorhanden, wird aber in Produktion mit `noindex` vermieden beziehungsweise nicht öffentlich beworben.
- Falls die alte Domain `tierarzt-praxis-schäffer.de` noch kontrolliert wird, wird sie nach Prüfung ebenfalls dauerhaft weitergeleitet.

## 4. Übernahme aus der alten Testseite

Die Dateien aus dem ZIP dienen als Inhalts- und Markenquelle. Das alte Joomla-/MHTML-Gerüst sowie dessen CSS- und JavaScript-Dateien werden nicht übernommen.

### 4.1 Aus dem Altbestand erkannte Daten

| Feld | übernommener Wert | Status vor Produktion |
|---|---|---|
| Praxisname | Tierarztpraxis Dr. Michael Schäffer | bestätigen |
| Telefonnummer | `0911 63 29 29 83` | prominent verwenden, nochmals bestätigen |
| Telefon-Link | `tel:+4991163292983` | aus der Nummer abgeleitet, bestätigen |
| Anschrift | Friedrich-Ebert-Straße 17, 90766 Fürth | bestätigen und Koordinaten ermitteln |
| Eröffnung | 2. Februar 2026 | als historische Information bestätigen |
| Montag | 08:00–19:00 Uhr | bestätigen |
| Dienstag bis Donnerstag | 09:00–19:00 Uhr | bestätigen |
| Freitag | 08:00–19:00 Uhr | bestätigen |
| Samstag | 10:00–17:00 Uhr | bestätigen |
| Samstagshinweis | Notfallsprechstunde, erhöhter Gebührensatz nach GOT | fachlich und rechtlich bestätigen |
| Terminregel | stets telefonische Voranmeldung erbeten | bestätigen |
| bisherige öffentliche E-Mail | `info@tierarzt-praxis-schäffer.de` | nicht ungeprüft veröffentlichen |
| vorläufiges Formularziel | `tierarztpraxis_schaffer@herr-der-mails.de` | als Cloudflare-Zieladresse verifizieren |
| Instagram | sichtbarer Handle `tierarztpraxis_dr_schaeffer` | Link und Eigentümerschaft bestätigen |
| Facebook | QR-Ziel mit Seiten-ID `61587199954668` | öffentlichen Seitennamen/Link bestätigen |
| Markenbotschaft | „Aus Leidenschaft – Für Ihren Liebling – Für Sie“ | als Grundlage verwenden |
| Positionierung | „mit Herz, Kompetenz und moderner Tiermedizin“ | sachlich, ohne Superlative verwenden |

Jeder Wert erhält im späteren Datenmodell neben dem Inhalt einen Prüfstatus. Werte aus dem Altbestand gelten zunächst als `legacy-unverified`; ein Produktionsbuild akzeptiert Pflichtwerte erst nach Umstellung auf `verified`.

### 4.2 Bilder und Markenmaterial

Aus dem ZIP werden folgende Dateien eingeplant:

| Altdatei | geplanter Einsatz |
|---|---|
| `0cb2a04d-6ab9-4e65-95e8-00af20fbfe60.jpg` | Markenreferenz und optional kleine Chronik zur Eröffnung, nicht als aktueller Hero |
| `instaQR.jpg` | optionaler QR-Code im Social-Bereich oder für Druckmaterial; direkter Link bleibt primär |
| `facebookQR.jpg` | optionaler QR-Code im Social-Bereich oder für Druckmaterial; direkter Link bleibt primär |

Vor dem Import werden Metadaten entfernt und die Bilder in WebP/AVIF plus JPEG-Fallback exportiert. Das große Eröffnungsplakat wird nicht einfach als Seiteninhalt eingebettet, weil „Wir eröffnen“ inzwischen veraltet ist. Sinnvolle Nutzung:

- Logo und Farben als visuelle Referenz;
- auf der Praxisseite ein kleiner Abschnitt „Unsere Eröffnung am 2. Februar 2026“, sofern das Datum bestätigt wird;
- ein bereinigtes, hochauflösendes Logo als SVG oder PDF wird in Phase 0 angefordert;
- QR-Codes werden nie als einzige Zugriffsmöglichkeit verwendet.

### 4.3 Nicht übernehmen

- Joomla-Template-CSS und -JavaScript;
- eingebettete Sitzungs-, Formular- oder CSRF-Werte aus der MHTML-Datei;
- veraltete Aussagen wie „Homepage befindet sich noch im Aufbau“;
- Tracking-Skripte oder direkte Social-Media-Embeds;
- fremde oder unklare Bibliotheken aus der alten Seite.

## 5. Inhalts- und Seitenstruktur

```text
/
├── Leistungen
├── Praxis & Team
├── Sprechzeiten
├── Notfall
├── Kontakt & Anfahrt
├── FAQ
├── Stellenangebote
├── Barrierefreiheit
├── Impressum
├── Datenschutz
└── 404
```

FAQ und Stellenangebote sind feste Bestandteile der ersten Version, nicht mehr optional.

### 5.1 Startseite

Empfohlene Reihenfolge:

1. **Kontaktleiste:** sichtbare Telefonnummer, Öffnungszeiten-Link und Notfall-Link.
2. **Hero:** klare Praxisidentität, Telefon-CTA und sekundärer Kontakt-CTA.
3. **Notfallhinweis:** Telefon statt Formular, Regeln innerhalb und außerhalb der Sprechzeiten.
4. **Sprechzeiten:** kompakte Tabelle plus Hinweis auf telefonische Voranmeldung.
5. **Leistungen:** nur tatsächlich bestätigte Leistungen.
6. **Praxis und Team:** Persönlichkeit, Qualifikationen, echte Fotos.
7. **Anfahrt:** Adresse, OSM-Zwei-Klick-Karte, Route, Parken, ÖPNV und bauliche Barrierefreiheit.
8. **FAQ-Vorschau:** häufige praktische Fragen einschließlich Barrierefreiheit.
9. **Stellenangebote-Vorschau:** aktive Stelle oder ehrlicher Leerzustand.
10. **Kontakt:** Telefon, Formular, E-Mail-Fallback und Datenschutzkurzhinweis.

### 5.2 Vorgeschlagene Startseitentexte

Die Texte werden vor Produktion von der Praxis freigegeben. Sie orientieren sich an der Altseite, ohne deren Eröffnungsankündigung zu kopieren.

```text
Tierarztpraxis Dr. Michael Schäffer in Fürth

Mit Herz, Kompetenz und moderner Tiermedizin.
Aus Leidenschaft für Ihren Liebling – persönlich für Sie da.

[0911 63 29 29 83 anrufen]  [Kontakt aufnehmen]
```

Direkt unter dem Hero:

```text
Bitte melden Sie Ihren Besuch telefonisch an.
In einem Notfall rufen Sie uns unmittelbar an – das Kontaktformular
ist kein Notfallkanal.
```

Die Formulierungen „beste“, „führende“, „24/7 erreichbar“ oder ähnliche nicht belegte Versprechen werden nicht verwendet.

## 6. Telefonnummer und mobile Bedienung

Die Telefonnummer wird nie hinter einem bloßen Telefonsymbol versteckt.

- Desktop: als Textlink in der oberen Kontaktleiste;
- Hero: großer Button mit sichtbarer Nummer;
- Notfallkarte: Nummer erneut sichtbar;
- Sprechzeiten: Telefonhinweis direkt darunter;
- Footer: vollständige Kontaktdaten;
- Mobil: fest positionierte, aber nicht verdeckende Leiste mit `Anrufen`, `Route` und `Kontakt`;
- semantisch: `<a href="tel:+4991163292983">0911 63 29 29 83</a>`;
- Screenreader-Label: „Tierarztpraxis Dr. Schäffer unter 0911 63 29 29 83 anrufen“.

## 7. OpenStreetMap-Integration

OSM wird als **datensparsame Zwei-Klick-Karte** umgesetzt:

1. Ohne Einwilligung oder Aktion wird nur eine lokale Kartenfläche mit Adresse und einem Button angezeigt. Es fließt noch keine Anfrage an OpenStreetMap.
2. Nach Betätigung von „OpenStreetMap laden“ wird ein offizieller OSM-Embed in einem `iframe` geladen.
3. Adresse, Telefonnummer und ein externer Routenlink bleiben auch ohne JavaScript und ohne geladene Karte verfügbar.
4. Die Karte erhält einen aussagekräftigen `title`, Lazy Loading und eine sichtbare OpenStreetMap-Attribution.
5. Für die Koordinaten werden Platzhalter verwendet, bis die Adresse verifiziert und geokodiert wurde.

Geplante Pflichtwerte:

```ts
map: {
  latitude: "TODO: Breitengrad ermitteln",
  longitude: "TODO: Längengrad ermitteln",
  zoom: 17,
  attribution: "© OpenStreetMap-Mitwirkende",
}
```

Für Version 1 wird kein eigenes Leaflet-Bundle benötigt. Der offizielle OSM-Embed ist kleiner und vermeidet unnötige Tile-Logik. Ein direkter Link „In OpenStreetMap öffnen“ ist immer vorhanden.

## 8. FAQ – verbindlicher Inhalt

Die FAQ-Seite verwendet native `<details>`-Elemente, funktioniert ohne JavaScript und ist vollständig per Tastatur bedienbar.

Geplante Fragen:

1. **Brauche ich einen Termin?**  
   Hinweis auf die telefonische Voranmeldung; endgültige Regeln bestätigen.

2. **Was soll ich in einem Notfall tun?**  
   Sofort anrufen, Formular nicht verwenden, Regelung außerhalb der Öffnungszeiten als Platzhalter bis zur Bestätigung.

3. **Welche Tiere behandelt die Praxis?**  
   `TODO: Tierarten und eventuelle Ausschlüsse bestätigen`.

4. **Welche Leistungen werden angeboten?**  
   Nur bestätigte Leistungen; Link zur Leistungsseite.

5. **Was soll ich zum Termin mitbringen?**  
   Vorschlag: Impfpass, Medikamentenliste und vorhandene Befunde; von der Praxis fachlich freigeben lassen.

6. **Wie erreiche ich die Praxis und wo kann ich parken?**  
   Adresse, OSM-Link, ÖPNV- und Parkplatzinformationen als verifizierte Daten beziehungsweise Platzhalter.

7. **Ist die Praxis barrierefrei erreichbar?**  
   Konkrete Angaben statt einer pauschalen Behauptung: stufenloser Eingang, Türbreite, Aufzug, barrierefreies WC, Parkplatz und Unterstützung. Nicht bekannte Details bleiben als sichtbare Entwicklungsplatzhalter und werden vor Produktion geklärt.

8. **Ist auch diese Website barrierearm nutzbar?**  
   Geplanter Text:

   > Wir entwickeln diese Website mit besonderem Augenmerk auf Barrierefreiheit. Dazu gehören eine klare Struktur, Tastaturbedienung, sichtbare Fokusmarkierungen, ausreichende Kontraste, vergrößerbare Texte und verständliche Formulare. Unser Ziel ist WCAG 2.2 auf Stufe AA. Sollten Sie auf eine Barriere stoßen, freuen wir uns über einen Hinweis per Telefon oder über den dafür vorgesehenen Kontaktweg.

   Eine Zertifizierung wird nicht behauptet. Nach dem Abschluss der Tests verweist die Antwort auf die Seite `/barrierefreiheit/` mit bekannten Einschränkungen und Kontaktmöglichkeit.

9. **Kann ich Befunde oder Bilder über das Kontaktformular schicken?**  
   Nein in Version 1; keine Datei-Uploads und keine hochsensiblen medizinischen Daten über das allgemeine Formular.

10. **Wo finde ich die Praxis in sozialen Netzwerken?**  
    Direkte, geprüfte Links zu Instagram und Facebook; externe Dienste werden klar gekennzeichnet.

## 9. Stellenangebote – verbindlicher Inhalt

Die Route `/stellenangebote/` wird immer veröffentlicht.

### 9.1 Ohne aktive Ausschreibung

```text
Derzeit ist keine konkrete Stelle ausgeschrieben.

Sie interessieren sich trotzdem für die Arbeit in unserer Praxis?
Informationen zu Initiativbewerbungen folgen nach Freigabe des
Bewerbungswegs.
```

Bis der Bewerbungsweg geklärt ist, wird keine Bewerbung per allgemeinem Kontaktformular ermöglicht. Insbesondere gibt es dort keine Datei-Uploads für Lebensläufe oder Zeugnisse.

### 9.2 Mit aktiver Ausschreibung

Jede Stelle erhält strukturierte Daten:

```ts
interface JobPosting {
  slug: string;
  title: string;
  employmentType: "FULL_TIME" | "PART_TIME" | "MINIJOB" | "APPRENTICESHIP";
  workload: string;
  startDate: string;
  responsibilities: readonly string[];
  requirements: readonly string[];
  benefits: readonly string[];
  contact: string;
  publishedAt: string;
  validThrough?: string;
  active: boolean;
  verified: boolean;
}
```

Nur aktive und bestätigte Stellen werden als `JobPosting`-Schema ausgegeben. Platzhalter oder abgelaufene Stellen dürfen nicht in Suchmaschinen-Markup landen. Bewerbungsdatenschutz wird getrennt vom allgemeinen Kontaktformular beschrieben.

## 10. Was ist ein Honeypot-Feld?

Ein Honeypot ist ein zusätzliches Formularfeld, das echte Besucherinnen und Besucher weder sehen noch bedienen. Viele einfache Spam-Bots füllen jedoch automatisch jedes Feld aus. Ist der Honeypot befüllt, behandelt der Worker die Anfrage als wahrscheinlichen Bot.

Wichtig für die Umsetzung:

- für Menschen visuell außerhalb des sichtbaren Bereichs positionieren;
- `tabindex="-1"`, `aria-hidden="true"` und `autocomplete="off"` setzen;
- nicht als einziges Schutzverfahren verwenden;
- gefüllte Honeypot-Anfragen möglichst mit einer neutralen Erfolgsantwort quittieren, aber keine E-Mail senden; so erfährt der Bot nicht, wodurch er aufgefallen ist;
- Passwortmanager und Autofill berücksichtigen;
- Feldname unauffällig, aber nicht irreführend wählen.

Beispiel:

```html
<div class="form-trap" aria-hidden="true">
  <label for="company-website">Website</label>
  <input
    id="company-website"
    name="companyWebsite"
    type="text"
    tabindex="-1"
    autocomplete="off"
  />
</div>
```

Der Honeypot ist ein günstiges Zusatzsignal, aber kein Ersatz für serverseitige Validierung und Turnstile.

## 11. Was ist ein Turnstile-Token?

Cloudflare Turnstile prüft im Browser, ob eine Anfrage plausibel von einem Menschen stammt. Nach dieser Prüfung erzeugt Turnstile einen kurzen Token. Das Kontaktformular sendet ihn zusammen mit den Eingaben an den Worker.

Der Worker muss anschließend:

1. den Token an Cloudflares Siteverify-Endpunkt senden;
2. `success` prüfen;
3. den erwarteten Hostnamen prüfen;
4. die erwartete Aktion, beispielsweise `contact_form`, prüfen;
5. abgelaufene oder bereits verwendete Tokens ablehnen.

Der Token ist kein Passwort und enthält nicht die Nachricht. Er ist kurzlebig, nur einmal verwendbar und ersetzt niemals die serverseitige Eingabeprüfung.

## 12. Kontaktformular und Worker

### 12.1 Felder

- Name;
- bevorzugter Rückkanal: E-Mail und/oder Telefonnummer;
- Anliegenkategorie;
- kurze Nachricht;
- Datenschutzhinweis;
- Honeypot;
- Turnstile-Token.

Nicht vorgesehen:

- Datei-Uploads;
- Röntgenbilder oder Befunde;
- Rezeptbestellungen ohne einen gesondert abgestimmten Prozess;
- Notfallmeldungen;
- unbegrenzter Freitext;
- automatische Terminbestätigungen.

### 12.2 Endpunkt

```text
POST https://api.tierarztpraxis-schaffer.telacore.org/v1/contact
```

### 12.3 E-Mail-Ziel während der Testphase

```text
tierarztpraxis_schaffer@herr-der-mails.de
```

Diese Adresse wird ausschließlich serverseitig konfiguriert und als erlaubte beziehungsweise verifizierte Zieladresse in Cloudflare hinterlegt. Das Frontend kann den Empfänger nicht überschreiben.

### 12.4 Verarbeitungsablauf

1. Nur `POST` und kontrollierte `OPTIONS`-Anfragen akzeptieren.
2. Exakte Origin-Allowlist prüfen; kein `*` bei CORS.
3. Content-Type und maximal 8 KiB Request-Body prüfen.
4. JSON sicher parsen und nur erlaubte Felder übernehmen.
5. Unicode normalisieren und Feldlängen begrenzen.
6. Zeilenumbrüche in E-Mail-Headerfeldern ablehnen.
7. Honeypot und Mindest-Ausfüllzeit prüfen.
8. Turnstile serverseitig validieren.
9. Hostname und Action des Tokens prüfen.
10. E-Mail mit festem Absender und Empfänger senden.
11. Nur Request-ID, Ergebniscode und grobe Laufzeit protokollieren.
12. Nachricht, Name, E-Mail, Telefonnummer, Turnstile-Token und rohe IP nicht loggen.

Automatische Antwortmails an beliebige Formularabsender werden im Free-Tier zunächst nicht vorgesehen. Die Website zeigt nach erfolgreichem Versand eine Bestätigung im Browser.

## 13. Entwicklungsmodus und Pflichtwertprüfung

### 13.1 Ziel

- Während der Entwicklung dürfen beschriftete Platzhalter sichtbar sein.
- Ein Produktionsbuild darf niemals mit `TODO`, leeren Pflichtwerten oder unbestätigten Pflichtangaben durchlaufen.
- Ein versehentlich gesetzter Entwicklungsschalter darf die Produktionssperre nicht aushebeln.

### 13.2 Umgebungsvariablen

```dotenv
# lokale Entwicklung
SITE_DEPLOYMENT_MODE=development
ALLOW_PLACEHOLDERS=true
CONTACT_FORM_MODE=mock
```

```dotenv
# GitHub-Pages-Produktion, im Workflow fest verdrahtet
SITE_DEPLOYMENT_MODE=production
ALLOW_PLACEHOLDERS=false
CONTACT_FORM_MODE=live
```

Regeln:

- `production` plus `ALLOW_PLACEHOLDERS=true` führt immer zu einem Fehler;
- vorhandene Pflichtplatzhalter plus `ALLOW_PLACEHOLDERS=false` führen zu einem Fehler;
- im Entwicklungsmodus erscheinen ein sichtbarer Entwicklungsbanner und `noindex,nofollow`;
- das Live-Formular bleibt in Entwicklung standardmäßig deaktiviert oder arbeitet im Mock-Modus;
- `docs/`, Tests und Beispielcode werden von der TODO-Inhaltsprüfung ausgeschlossen.

### 13.3 Validierungsskeleton

```ts
// scripts/validate-content.ts

const mode = process.env.SITE_DEPLOYMENT_MODE ?? "development";
const allowPlaceholders = process.env.ALLOW_PLACEHOLDERS === "true";

if (mode === "production" && allowPlaceholders) {
  throw new Error(
    "Unsichere Konfiguration: Platzhalter dürfen in Produktion nie erlaubt sein.",
  );
}

const forbiddenPatterns = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\bCHANGEME\b/i,
];

const problems = validatePracticeContent({
  forbiddenPatterns,
  requireVerifiedValues: mode === "production",
});

if (problems.length > 0 && !allowPlaceholders) {
  console.error(problems.join("\n"));
  process.exit(1);
}
```

Der Build startet mit:

```json
{
  "scripts": {
    "validate:content": "tsx scripts/validate-content.ts",
    "build": "pnpm validate:content && astro build"
  }
}
```

### 13.4 Datenmodell mit Prüfstatus

```ts
interface VerifiedValue<T> {
  value: T;
  status: "todo" | "legacy-unverified" | "verified";
  source?: string;
}

export const practice = {
  name: {
    value: "Tierarztpraxis Dr. Michael Schäffer",
    status: "legacy-unverified",
    source: "alte Testseite und Eröffnungsplakat",
  },

  phone: {
    display: {
      value: "0911 63 29 29 83",
      status: "legacy-unverified",
    },
    href: {
      value: "tel:+4991163292983",
      status: "legacy-unverified",
    },
  },

  address: {
    street: {
      value: "Friedrich-Ebert-Straße 17",
      status: "legacy-unverified",
    },
    postalCode: {
      value: "90766",
      status: "legacy-unverified",
    },
    city: {
      value: "Fürth",
      status: "legacy-unverified",
    },
    accessibility: {
      value: "TODO: bauliche Barrierefreiheit der Praxis beschreiben",
      status: "todo",
    },
  },

  publicEmail: {
    value: "TODO: öffentliche Praxis-E-Mail bestätigen",
    status: "todo",
  },

  contactFormRecipient: {
    value: "tierarztpraxis_schaffer@herr-der-mails.de",
    status: "verified",
  },
} as const;
```

Die Testzieladresse ist als Projektvorgabe bekannt. „Verified“ im Code bedeutet hier nur „vom Projekt festgelegt“; Cloudflare muss die Adresse zusätzlich technisch verifizieren.

## 14. Repository-Skeleton

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
│   ├── UMSETZUNGSPLAN.md
│   └── ALTSEITEN-INVENTAR.md
├── public/
│   ├── favicon.svg
│   ├── robots.txt
│   └── site.webmanifest
├── scripts/
│   ├── validate-content.ts
│   └── check-links.ts
├── src/
│   ├── assets/
│   │   ├── brand/
│   │   ├── practice/
│   │   ├── team/
│   │   └── legacy/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.astro
│   │   │   ├── Footer.astro
│   │   │   └── MobileActions.astro
│   │   ├── sections/
│   │   │   ├── Hero.astro
│   │   │   ├── PhoneCallout.astro
│   │   │   ├── EmergencyNotice.astro
│   │   │   ├── OpeningHours.astro
│   │   │   ├── ServiceGrid.astro
│   │   │   ├── AccessibleOsmMap.astro
│   │   │   └── ContactSection.astro
│   │   └── ui/
│   │       ├── Button.astro
│   │       ├── Card.astro
│   │       ├── DevelopmentBanner.astro
│   │       └── ExternalLink.astro
│   ├── config/
│   │   ├── practice.ts
│   │   ├── site.ts
│   │   └── navigation.ts
│   ├── content/
│   │   ├── services/
│   │   ├── team/
│   │   └── notices/
│   ├── data/
│   │   ├── faq.ts
│   │   ├── jobs.ts
│   │   └── opening-hours.ts
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── leistungen/index.astro
│   │   ├── praxis/index.astro
│   │   ├── sprechzeiten/index.astro
│   │   ├── notfall/index.astro
│   │   ├── kontakt/index.astro
│   │   ├── faq/index.astro
│   │   ├── stellenangebote/index.astro
│   │   ├── barrierefreiheit/index.astro
│   │   ├── impressum.astro
│   │   ├── datenschutz.astro
│   │   └── 404.astro
│   ├── styles/
│   │   ├── tokens.css
│   │   └── global.css
│   └── utils/
│       ├── seo.ts
│       ├── structured-data.ts
│       └── environment.ts
├── worker/
│   ├── src/
│   │   ├── index.ts
│   │   ├── contact.ts
│   │   ├── validation.ts
│   │   ├── turnstile.ts
│   │   ├── mail.ts
│   │   └── response.ts
│   ├── test/
│   │   └── contact.test.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.jsonc
├── tests/
│   └── e2e/
│       ├── accessibility.spec.ts
│       ├── navigation.spec.ts
│       ├── contact.spec.ts
│       └── osm-map.spec.ts
├── .env.example
├── .node-version
├── astro.config.mjs
├── package.json
├── playwright.config.ts
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.json
├── README.md
├── SECURITY.md
└── LICENSE
```

## 15. OSM-Komponentenskeleton

```astro
---
interface Props {
  address: string;
  embedUrl: string;
  mapUrl: string;
}

const { address, embedUrl, mapUrl } = Astro.props;
---

<section class="map" aria-labelledby="map-heading">
  <h2 id="map-heading">Anfahrt</h2>
  <p>{address}</p>

  <div data-map-placeholder>
    <p>
      Die interaktive Karte wird erst geladen, wenn Sie den Button
      betätigen. Dabei wird eine Verbindung zu OpenStreetMap hergestellt.
    </p>
    <button type="button" data-load-map>OpenStreetMap laden</button>
  </div>

  <template data-map-template>
    <iframe
      title={`OpenStreetMap-Karte zur ${address}`}
      src={embedUrl}
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
  </template>

  <p>
    <a href={mapUrl} rel="external noreferrer">
      Standort direkt in OpenStreetMap öffnen
    </a>
  </p>
  <p class="map-attribution">© OpenStreetMap-Mitwirkende</p>
</section>
```

Das kleine Ladeskript wird progressiv ergänzt; ohne JavaScript bleiben Adresse und externer Link vollständig nutzbar.

## 16. Worker-Skeleton

```ts
interface Env {
  ALLOWED_ORIGINS: string;
  EXPECTED_TURNSTILE_HOSTNAME: string;
  TURNSTILE_SECRET: string;
  CONTACT_FROM: string;
  CONTACT_TO: string;
  EMAIL: EmailBinding;
}

const MAX_BODY_BYTES = 8_192;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/v1/contact") {
      return json({ error: "Not found" }, 404);
    }

    const origin = request.headers.get("Origin");
    const allowedOrigins = new Set(
      env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()),
    );

    if (!origin || !allowedOrigins.has(origin)) {
      return json({ error: "Forbidden" }, 403);
    }

    if (request.method === "OPTIONS") {
      return corsPreflight(origin);
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, origin);
    }

    const payload = await readLimitedJson(request, MAX_BODY_BYTES);
    const submission = validateContactSubmission(payload);

    if (submission.honeypot !== "") {
      return json({ accepted: true }, 202, origin);
    }

    await verifyTurnstile({
      token: submission.turnstileToken,
      secret: env.TURNSTILE_SECRET,
      expectedHostname: env.EXPECTED_TURNSTILE_HOSTNAME,
      expectedAction: "contact_form",
    });

    const requestId = crypto.randomUUID();
    await sendContactMail(env, submission, requestId);

    return json({ accepted: true, requestId }, 202, origin);
  },
};
```

Die produktive Origin-Allowlist enthält nur die kanonische Website. Lokale Entwicklungsadressen werden ausschließlich in einer getrennten Entwicklungsumgebung erlaubt.

## 17. Designrichtung

Die alte Seite liefert eine klare visuelle Grundlage: frisches Grün, weiches Mint/Türkis, helle Naturtöne, graue Typografie und Pfoten-/Tiermotiv. Daraus entsteht ein ruhiges, freundliches Design, ohne wie ein generisches „Bio“-Template zu wirken.

Vorläufige Design-Tokens werden aus dem Bild abgeleitet und anschließend auf Kontrast geprüft:

```css
:root {
  --color-brand-700: #2f6f2a;
  --color-brand-600: #4f8f3a;
  --color-mint-100: #e7f3ed;
  --color-surface: #fffefb;
  --color-text: #202421;
  --color-muted: #5a625d;
  --color-emergency: #9b2c2c;
}
```

Die endgültigen Werte werden so angepasst, dass Text- und Interaktionskontraste WCAG 2.2 AA erfüllen. Als Schrift wird zunächst ein System-Font-Stack verwendet; dadurch gibt es keine externen Font-Requests.

## 18. Barrierefreiheit

Qualitätsziel ist WCAG 2.2 AA. Geplant sind:

- semantisches HTML und korrekte Überschriftenhierarchie;
- Skip-Link;
- vollständig sichtbarer Tastaturfokus;
- Bedienbarkeit ohne Maus;
- verständliche Link- und Buttontexte;
- ausreichende Farbkontraste;
- große Touch-Ziele;
- Unterstützung von `prefers-reduced-motion`;
- Fehlertexte direkt am Feld und zusammengefasst am Formularanfang;
- Statusmeldungen über `aria-live`;
- Alternativtexte auf Basis des Bildzwecks;
- 200 Prozent Zoom ohne Inhaltsverlust;
- native FAQ-Elemente;
- OSM und Turnstile mit tastatur- und screenreadertauglichen Alternativen;
- eigene Seite `/barrierefreiheit/` mit Kontaktweg und bekannten Einschränkungen;
- kein unbelegtes Gütesiegel und keine behauptete Zertifizierung.

Zusätzlich wird die physische Barrierefreiheit der Praxis als eigener Datenblock erfasst. Website-Barrierefreiheit und bauliche Barrierefreiheit werden nicht miteinander vermischt.

## 19. Datenschutz und Recht

Standardmäßig nicht eingebunden:

- Google Analytics;
- Google Maps;
- Google Fonts;
- YouTube- oder Social-Media-Embeds;
- Meta Pixel;
- Chat-Widgets;
- nicht notwendige Cookies.

Die OSM-Karte wird erst nach aktiver Betätigung geladen. Turnstile und Cloudflare-Verarbeitung werden in der Datenschutzerklärung beschrieben. Das Kontaktformular erläutert Zweck, Rechtsgrundlage, Empfänger, Aufbewahrung und Betroffenenrechte. Bewerbungsdaten erhalten einen eigenen Datenschutzabschnitt.

Impressum und Datenschutz werden mit Platzhaltern angelegt und vor Produktion fachlich geprüft. Für die Tierarztpraxis sind insbesondere zuständige Tierärztekammer, Aufsichtsbehörde, Berufsbezeichnung, Verleihungsstaat, berufsrechtliche Regelungen und gegebenenfalls Berufshaftpflichtangaben zu klären.

## 20. Sicherheits- und Härtungskonzept

| Risiko | Maßnahme |
|---|---|
| Spam | Honeypot, Turnstile, Ausfüllzeit, Längenlimits |
| Formularmissbrauch | feste Route, nur POST, exakte Origin-Allowlist, kein Wildcard-CORS |
| Turnstile-Umgehung | zwingende Siteverify-Prüfung, Hostname und Action prüfen |
| Header-Injection | CR/LF in E-Mail-Feldern ablehnen, feste Headerwerte |
| XSS | statische Ausgabe, keine ungeprüften HTML-Inhalte, Ausgabe escapen |
| große Requests | 8-KiB-Limit vor und nach dem Lesen |
| sensible Logs | keine Formulardaten, Tokens oder rohen IPs protokollieren |
| Empfängermanipulation | Empfänger nur als Worker-Konfiguration, nie aus dem Browser |
| Datenleck | keine Datenbank und keine Datei-Uploads in Version 1 |
| Supply Chain | Lockfile, minimale Dependencies, Dependabot, Actions auf Commit-SHAs pinnen |
| kompromittierter Build | minimale Workflow-Rechte und getrennte Website-/Worker-Deployments |
| Domain-Takeover | GitHub-Domain vor DNS-Zuordnung verifizieren, keine Wildcard-Records |
| Clickjacking | CSP `frame-ancestors 'none'` |
| Fremdinhalte | strenge CSP; OSM und Turnstile nur explizit freigeben |
| veraltete Notfalldaten | zentraler Datenbestand und regelmäßiger Inhaltscheck |
| Formularausfall | Telefonnummer und alternative Kontaktmöglichkeit bleiben sichtbar |

Vorgesehene Header:

```http
Content-Security-Policy:
  default-src 'self';
  base-uri 'self';
  object-src 'none';
  frame-ancestors 'none';
  form-action 'self' https://api.tierarztpraxis-schaffer.telacore.org;
  img-src 'self' data:;
  font-src 'self';
  style-src 'self';
  script-src 'self' https://challenges.cloudflare.com;
  frame-src https://challenges.cloudflare.com https://www.openstreetmap.org;
  connect-src 'self' https://api.tierarztpraxis-schaffer.telacore.org https://challenges.cloudflare.com;
  upgrade-insecure-requests

Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Die CSP wird mit Turnstile und OSM in einer Testumgebung geprüft, bevor sie blockierend aktiviert wird.

## 21. SEO und strukturierte Daten

- eindeutige Seitentitel und Beschreibungen;
- Canonical ausschließlich auf `tierarztpraxis-schaffer.telacore.org`;
- XML-Sitemap und `robots.txt`;
- Open-Graph-Bild aus freigegebenem Praxisbild;
- strukturierte Daten für Praxis, Adresse, Telefon und Öffnungszeiten nur mit bestätigten Werten;
- `sameAs` nur für geprüfte Social-Links;
- `JobPosting` nur für aktive, bestätigte Stellen;
- keine medizinischen Versprechen oder erfundenen Leistungen;
- Entwicklungs- und Vorschauversionen sind `noindex,nofollow`.

## 22. CI und Deployment

Jeder Pull Request muss bestehen:

```text
pnpm format:check
pnpm lint
pnpm check
pnpm validate:content
pnpm test
pnpm build
pnpm test:e2e
```

Der Produktionsjob setzt die Sicherheitswerte selbst und übernimmt sie nicht aus frei änderbaren Repository-Variablen:

```yaml
env:
  SITE_DEPLOYMENT_MODE: production
  ALLOW_PLACEHOLDERS: "false"
  CONTACT_FORM_MODE: live
```

GitHub-Pages- und Worker-Deployment bleiben getrennte Workflows. Secrets wie Turnstile-Secret oder Mail-Konfiguration werden nur in Cloudflare beziehungsweise geschützten GitHub-Secrets verwaltet und nie mit `PUBLIC_` veröffentlicht.

Empfohlene Branch-Regeln:

- kein direkter Push auf `main`;
- Pull Request erforderlich;
- alle Prüfungen müssen grün sein;
- alte Freigaben bei neuen Commits verwerfen;
- Force-Push und Löschung von `main` sperren;
- Produktionsdeployment nur aus `main`;
- mindestens ein Review, sobald weitere Personen mitarbeiten.

## 23. Phasenplan

### Phase 0 – Inhalte erfassen und Altbestand bereinigen

- alle Werte aus dem ZIP in das zentrale Datenmodell übernehmen;
- nicht ermittelbare Werte mit beschreibenden `TODO:`-Platzhaltern anlegen;
- Telefonnummer, Adresse und Öffnungszeiten durch die Praxis bestätigen;
- Notfall- und Samstagshinweis fachlich prüfen;
- öffentliche E-Mail festlegen;
- OSM-Koordinaten, Parkplatz, ÖPNV und bauliche Barrierefreiheit erfassen;
- Team, Qualifikationen, Leistungen und Tierarten erfassen;
- Kammer-, Aufsichts- und Versicherungsdaten erfassen;
- Instagram- und Facebook-Links bestätigen;
- Bildrechte und Nutzungsfreigaben dokumentieren;
- sauberes Logo in SVG/PDF anfordern;
- aktive Stellen oder gewünschten Leerzustand festlegen.

**Regel:** Was in Phase 0 nicht ermittelt werden kann, wird nicht erfunden. Es erhält einen eindeutigen Platzhalter und blockiert nur den Produktionsbuild, nicht die lokale Entwicklung.

### Phase 1 – technisches Bootstrap

- Astro-Projekt und pnpm-Workspace initialisieren;
- TypeScript Strict Mode;
- zentrales Praxisdatenmodell und Validierung;
- Entwicklungsbanner und Noindex-Modus;
- CI und GitHub-Pages-Deployment;
- Worker-Skeleton und getrennte Testumgebung;
- README, SECURITY.md und Architekturhinweise.

### Phase 2 – Designsystem und Bildpipeline

- Farben aus der Marke ableiten und auf Kontrast prüfen;
- responsive Typografie und Abstände;
- Header, Footer, Buttons, Karten und Statuszustände;
- Bilder bereinigen, komprimieren und responsive Varianten erzeugen;
- Logo-/Fallback-Strategie;
- MobileActions ohne Inhaltsüberdeckung.

### Phase 3 – Seiten und Inhalte

- Startseite;
- Leistungen;
- Praxis und Team;
- Sprechzeiten;
- Notfall;
- Kontakt und Anfahrt mit OSM;
- FAQ einschließlich Barrierefreiheitsfragen;
- Stellenangebote;
- Barrierefreiheitserklärung;
- Impressum, Datenschutz und 404.

### Phase 4 – Kontakt-Backend

- Worker-Endpunkt unter der bindestrichbasierten API-Domain;
- Validierung, Honeypot und Ausfüllzeit;
- Turnstile mit Testschlüsseln und Produktionseinstellungen;
- feste Testzieladresse `tierarztpraxis_schaffer@herr-der-mails.de`;
- Text-E-Mails ohne Datei-Anhänge;
- Fehlermeldungen und Telefon-Fallback;
- Unit- und Integrationstests.

### Phase 5 – Domains und Härtung

- kanonische Domain bei GitHub verifizieren;
- GitHub Pages konfigurieren;
- CNAME direkt auf `h234598.github.io` ohne Repository-Pfad;
- HTTPS vollständig ausstellen lassen;
- Cloudflare-Proxy kontrolliert aktivieren;
- Alias-Domain weiterleiten;
- Worker Custom Domain anlegen;
- Security Header und CSP testen;
- keine Wildcard-DNS-Einträge.

### Phase 6 – Qualitätssicherung

- Chrome, Firefox und Safari;
- Smartphone, Tablet und Desktop;
- Tastatur und Screenreader-Stichprobe;
- 200-Prozent-Zoom;
- JavaScript deaktiviert;
- langsame Verbindung;
- OSM nicht geladen und geladen;
- Turnstile abgelaufen, wiederverwendet oder fehlerhaft;
- Worker und Maildienst nicht erreichbar;
- übergroße oder manipulierte Formularanfragen;
- alle Telefonnummern, Öffnungszeiten und Notfallhinweise manuell gegenprüfen.

### Phase 7 – Produktionsfreigabe

- alle Pflichtwerte auf `verified`;
- keine `TODO`-Werte in produktiven Inhaltsquellen;
- rechtliche Texte freigegeben;
- echte Zieladresse in Cloudflare verifiziert;
- Smoke-Test mit echter Testmail;
- Canonical, Sitemap, Redirects und 404 geprüft;
- Produktionsbuild mit `ALLOW_PLACEHOLDERS=false` erfolgreich;
- Indexierung freigeben.

### Phase 8 – Betrieb

- monatliche Prüfung von Sprechzeiten und Notfallinformationen;
- Stellenangebote auf Ablauf prüfen;
- quartalsweise Abhängigkeiten aktualisieren;
- Formular-Smoke-Test;
- jährliche Prüfung von Impressum, Datenschutz und Barrierefreiheit;
- Domain-, DNS- und Zugriffsrechte kontrollieren;
- definierter Ablauf für Urlaub, Feiertage und kurzfristige Hinweise.

## 24. Definition of Done

Die erste produktive Version ist fertig, wenn:

- alle Pflichtdaten bestätigt sind;
- die Telefonnummer auf der Startseite sofort sichtbar und anklickbar ist;
- Öffnungszeiten und Notfallregeln fachlich bestätigt sind;
- FAQ und Stellenangebotsseite vollständig vorhanden sind;
- die FAQ die digitale und physische Barrierefreiheit transparent behandelt;
- OSM erst nach bewusster Betätigung eingebettet wird und ohne Karte ein nutzbarer Fallback existiert;
- keine kritischen oder schwerwiegenden axe-core-Befunde bestehen;
- alle Hauptfunktionen per Tastatur nutzbar sind;
- keine ungeplanten Drittanbieter-Requests stattfinden;
- Turnstile ausschließlich serverseitig erfolgreich akzeptiert wird;
- Formularinhalt, Kontaktdaten, Token und rohe IP nicht geloggt werden;
- keine Datei-Uploads oder medizinischen Dokumente akzeptiert werden;
- Worker-Fehler verständlich behandelt werden und der Telefonkontakt erhalten bleibt;
- kanonische Domain und Alias-Weiterleitung korrekt funktionieren;
- Security Header und CSP geprüft sind;
- Produktionsbuilds bei jedem Platzhalter zuverlässig fehlschlagen;
- Entwicklungsbuilds mit bewusst gesetztem Schalter und sichtbarer Kennzeichnung möglich bleiben;
- Website und Worker reproduzierbar aus dem Repository deploybar sind.

## 25. Technische Referenzen

- Hostnamen: RFC 952 und RFC 1123
- GitHub Pages Custom Domains: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- Cloudflare Turnstile Siteverify: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Cloudflare Turnstile Pläne: https://developers.cloudflare.com/turnstile/plans/
- Cloudflare Email Service: https://developers.cloudflare.com/email-service/
- OpenStreetMap Embed: https://wiki.openstreetmap.org/wiki/Export#Embeddable_HTML
- OpenStreetMap Attribution: https://www.openstreetmap.org/copyright

---

**Nächster Implementierungsschritt:** ein Bootstrap-PR mit Astro, TypeScript, zentralem Praxisdatenmodell, Entwicklungs-/Produktionsschalter, Inhaltsvalidator, allen Seitenrouten und einem zunächst deaktivierten Worker-Skeleton. Die aus dem ZIP extrahierten Bilder werden dabei in eine kontrollierte Asset-Pipeline übernommen, nicht zusammen mit dem alten Joomla-Code.
