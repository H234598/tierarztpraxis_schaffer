# Tierarztpraxis Dr. Schäffer – Website

Moderne, barrierebewusst entwickelte Website für die Tierarztpraxis Dr. Schäffer in Fürth.

## Aktueller Stand

Das Repository enthält jetzt zwei auslieferbare Teile:

1. eine statische Astro-Website für GitHub Pages;
2. einen gehärteten Cloudflare-Worker für das Kontaktformular.

Die Website läuft bis zur Bestätigung aller fachlichen und rechtlichen Pflichtdaten im Entwicklungsmodus. Sie zeigt einen sichtbaren Hinweis, verhindert Suchmaschinenindexierung und darf markierte Platzhalter enthalten. Das Kontaktformular versendet bereits echte Testnachrichten an die serverseitig konfigurierte Testadresse.

## Adressen

- Website: `https://tierarztpraxis-schaffer.telacore.org`
- Alias: `https://tierarztpraxisschaffer.telacore.org`
- API: `https://api.tierarztpraxis-schaffer.telacore.org/v1/contact`
- GitHub-Projektpfad: `https://h234598.github.io/tierarztpraxis_schaffer/`

## Stack

- Astro 7 und TypeScript im Strict Mode;
- modernes CSS ohne UI-Laufzeitframework;
- GitHub Pages und GitHub Actions;
- Cloudflare Worker, Workers KV, Turnstile, Rate Limit und Email Service;
- OpenStreetMap;
- Vitest;
- kein Java.

## Lokale Entwicklung

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

Prüfkette:

```bash
pnpm check
pnpm worker:check
pnpm test
pnpm build
```

## Sicherheit

- exakte Origin-Allowlist;
- serverseitige Turnstile-Prüfung;
- Honeypot und Mindest-Ausfüllzeit;
- Rate Limit mit gesalzenem Hash statt roher IP als Schlüssel;
- maximal 8 KiB Request-Body;
- keine Datei-Uploads;
- keine Empfängeradresse aus dem Browser;
- keine personenbezogenen Anwendungslogs;
- reproduzierbare Installation mit eingecheckter Lockdatei.

## Barrierefreiheit

Die Praxis liegt vollständig im Erdgeschoss. Am Eingang gibt es eine kleine Türschwelle; die Eingangstür hat Standardbreite. Ein Aufzug ist nicht erforderlich. Geeignete Parkplätze liegen direkt vor der Praxis, und das Team unterstützt jederzeit.

Für die Website ist WCAG 2.2 AA das Qualitätsziel. Eine formale Zertifizierung wird nicht behauptet.

## Dokumentation

- [Vollständiger Umsetzungsplan](docs/UMSETZUNGSPLAN.md)
- [Aktueller Implementierungsstatus](docs/IMPLEMENTIERUNGSSTATUS.md)
- [Bestätigte und offene Praxisdaten](docs/PRAXISDATEN.md)
- [Cloudflare-Einrichtung](docs/CLOUDFLARE-SETUP.md)
- [Inventar der alten Testseite](docs/ALTSEITEN-INVENTAR.md)
