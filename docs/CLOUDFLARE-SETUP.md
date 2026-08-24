# Cloudflare-Einrichtung: Schritte 4 bis 13

Stand: 16. Juli 2026

Diese Anleitung setzt voraus, dass folgende Punkte bereits erledigt sind:

1. GitHub Pages verwendet GitHub Actions als Veröffentlichungsquelle.
2. `tierarztpraxis-schaffer.telacore.org` ist im Repository als Custom Domain
   hinterlegt.
3. Der DNS-CNAME der Website zeigt auf `h234598.github.io`.

## 4. Alias-Domain dauerhaft weiterleiten

Ziel:

```text
https://tierarztpraxisschaffer.telacore.org/irgendein/pfad?x=1
→
https://tierarztpraxis-schaffer.telacore.org/irgendein/pfad?x=1
```

### DNS vorbereiten

Für `tierarztpraxisschaffer.telacore.org` muss ein **proxied** DNS-Eintrag vorhanden
sein, damit Cloudflare die Redirect Rule ausführen kann. Geeignet ist beispielsweise:

```text
Typ: CNAME
Name: tierarztpraxisschaffer
Ziel: tierarztpraxis-schaffer.telacore.org
Proxy-Status: Proxied / orange Wolke
```

Der CNAME allein ist noch keine saubere kanonische Weiterleitung; die folgende Regel
liefert den eigentlichen HTTP-Redirect.

### Redirect Rule anlegen

1. Cloudflare öffnen und die Zone `telacore.org` auswählen.
2. **Rules → Redirect Rules → Single Redirects** öffnen.
3. **Create rule** wählen.
4. Regelname: `tierarztpraxis-alias-auf-kanonisch`.
5. Als Bedingung den Ausdruck verwenden:

   ```text
   http.host eq "tierarztpraxisschaffer.telacore.org"
   ```

6. Dynamische Ziel-URL:

   ```text
   concat("https://tierarztpraxis-schaffer.telacore.org", http.request.uri.path)
   ```

7. Statuscode `308` wählen.
8. **Preserve query string** aktivieren.
9. Regel veröffentlichen.

Tests:

```bash
curl -I https://tierarztpraxisschaffer.telacore.org/
curl -I 'https://tierarztpraxisschaffer.telacore.org/faq/?test=1'
```

Erwartet wird jeweils ein `308` mit einem `Location`-Header auf der kanonischen Domain;
Pfad und Query-String müssen erhalten bleiben.

## 5. Zwei Workers-KV-Namespaces anlegen

Die Umgebungen werden getrennt, damit Test- und Produktionskonfiguration nicht
versehentlich vermischt werden.

### Im Dashboard

1. Im Cloudflare-Konto die Seite **Workers KV** öffnen.
2. **Create instance** wählen.
3. Namespace anlegen:

   ```text
   tierarztpraxis-schaffer-contact-development
   ```

4. Zweiten Namespace anlegen:

   ```text
   tierarztpraxis-schaffer-contact-production
   ```

5. Die jeweilige Namespace-ID kopieren und sicher notieren.

### Alternativ mit Wrangler

Aus dem Repository:

```bash
corepack enable
pnpm install
cd worker
pnpm exec wrangler login
pnpm exec wrangler kv namespace create tierarztpraxis-schaffer-contact-development
pnpm exec wrangler kv namespace create tierarztpraxis-schaffer-contact-production
```

Wrangler gibt nach jedem Befehl die erzeugte ID aus.

## 6. KV-IDs in `worker/wrangler.jsonc` einsetzen

In der Entwicklungsumgebung:

```jsonc
"kv_namespaces": [
  {
    "binding": "CONTACT_CONFIG",
    "id": "HIER_DIE_DEVELOPMENT_NAMESPACE_ID"
  }
]
```

In der Produktionsumgebung:

```jsonc
"kv_namespaces": [
  {
    "binding": "CONTACT_CONFIG",
    "id": "HIER_DIE_PRODUCTION_NAMESPACE_ID"
  }
]
```

Wichtig:

- Der Binding-Name bleibt in beiden Umgebungen exakt `CONTACT_CONFIG`.
- Die IDs müssen unterschiedlich sein.
- Keine Namespace-ID ist ein Geheimnis, sie darf im Repository stehen.
- Die Platzhalter `TODO_DEVELOPMENT_KV_ID` und `TODO_PRODUCTION_KV_ID` müssen
  vollständig ersetzt werden, sonst blockiert der Deploy-Workflow.

## 7. Test-Empfänger in KV schreiben

Nach dem Eintragen der Development-ID:

```bash
cd worker
pnpm exec wrangler kv key put \
  --binding=CONTACT_CONFIG \
  --env=development \
  --remote \
  "contact:recipient:development" \
  "tierarztpraxis_schaffer@herr-der-mails.de"
```

Wert kontrollieren:

```bash
pnpm exec wrangler kv key get \
  --binding=CONTACT_CONFIG \
  --env=development \
  --remote \
  --text \
  "contact:recipient:development"
```

Alternativ im Dashboard:

1. Development-Namespace öffnen.
2. Tab **KV Pairs** öffnen.
3. **Add entry** wählen.
4. Key: `contact:recipient:development`.
5. Value: `tierarztpraxis_schaffer@herr-der-mails.de`.

Der Produktionsschlüssel wird erst angelegt, wenn eine produktive Empfängeradresse
bestätigt und verifiziert wurde:

```text
contact:recipient:production
```

## 8. Cloudflare Turnstile einrichten

Es werden getrennte Widgets für Entwicklung und Produktion empfohlen.

### Entwicklungswidget

1. Im Cloudflare-Dashboard **Turnstile** öffnen.
2. **Add widget** wählen.
3. Name: `Tierarztpraxis Kontaktformular – Entwicklung`.
4. Modus: **Managed**.
5. Zulässige Hostnamen:

   ```text
   tierarztpraxis-schaffer.telacore.org
   h234598.github.io
   ```

6. Widget erstellen.
7. Das öffentliche **Sitekey** kopieren.
8. Das geheime **Secret key** nur sicher zwischenspeichern.

Das Sitekey ist öffentlich und wird beim GitHub-Pages-Build als
`PUBLIC_TURNSTILE_SITE_KEY` verwendet. Das Secret darf niemals in eine
`PUBLIC_*`-Variable, in Git oder in Browsercode gelangen.

Worker-Secret setzen:

```bash
cd worker
pnpm exec wrangler secret put TURNSTILE_SECRET --env=development
```

Das Secret bei der Eingabe einfügen.

### Produktion

Später ein zweites Widget mit ausschließlich diesem Hostnamen anlegen:

```text
tierarztpraxis-schaffer.telacore.org
```

Dann dessen Secret setzen:

```bash
pnpm exec wrangler secret put TURNSTILE_SECRET --env=production
```

Für lokale automatisierte Tests werden ausschließlich Cloudflares offizielle
Testschlüssel genutzt. Ein Produktionsbuild darf diese Schlüssel nicht akzeptieren.

## 9. Salt für den Rate-Limit-Schlüssel erzeugen

Der Worker verwendet den Salt, um technische Merkmale für einen Missbrauchsschutz zu
hashen, statt die rohe IP-Adresse als Schlüssel zu verwenden oder zu protokollieren.

Zufallswert erzeugen:

```bash
openssl rand -hex 32
```

Den ausgegebenen Wert anschließend als Worker-Secret setzen:

```bash
cd worker
pnpm exec wrangler secret put RATE_LIMIT_SALT --env=development
```

Für Produktion einen **anderen** Zufallswert erzeugen:

```bash
pnpm exec wrangler secret put RATE_LIMIT_SALT --env=production
```

Regeln:

- mindestens 32 zufällige Bytes;
- nicht in `.env`, `.dev.vars`, GitHub-Kommentare oder Screenshots kopieren;
- getrennte Werte für Entwicklung und Produktion;
- bei Verdacht auf Offenlegung neu erzeugen und überschreiben.

## 10. Testziel und Absender für E-Mail verifizieren

### Zieladresse verifizieren

1. Cloudflare-Dashboard öffnen.
2. **Compute → Email Service → Email Routing → Destination Addresses** öffnen.
3. Diese Zieladresse hinzufügen:

   ```text
   tierarztpraxis_schaffer@herr-der-mails.de
   ```

4. Die von Cloudflare gesendete Bestätigungs-E-Mail öffnen.
5. **Verify email address** wählen.
6. Im Dashboard prüfen, dass der Status nicht mehr `Pending` ist.

### Absenderdomain einrichten

Der geplante Absender lautet:

```text
website@tierarztpraxis-schaffer.telacore.org
```

1. **Compute → Email Service → Email Sending** öffnen.
2. **Onboard Domain** wählen.
3. `tierarztpraxis-schaffer.telacore.org` auswählen beziehungsweise als sendende
   Subdomain hinzufügen.
4. Die vorgeschlagenen SPF-, DKIM-, DMARC- und `cf-bounce`-DNS-Einträge von Cloudflare
   anlegen lassen.
5. Unter **Email Sending → Settings** warten, bis die Einträge als korrekt konfiguriert
   angezeigt werden.

Das CNAME der Website wird dadurch nicht ersetzt: Die für Email Sending angelegten
Einträge liegen auf dafür vorgesehenen Namen wie `cf-bounce`, DKIM und `_dmarc`.

Auf dem Workers-Free-Tarif ist der Versand an verifizierte Zieladressen kostenlos. Der
Versand an beliebige, nicht verifizierte Empfänger ist damit nicht freigeschaltet.
Cloudflare Email Sending befindet sich derzeit in Public Beta; vor Produktion sind
Zustellung und Logs deshalb besonders gründlich zu testen.

## 11. Cloudflare-Zugang für GitHub Actions hinterlegen

### Account-ID kopieren

1. Cloudflare **Account Home** öffnen.
2. Am betreffenden Konto das Menü öffnen.
3. **Copy account ID** wählen.

Alternativ steht die Account-ID unter **Workers & Pages → Account details**.

### API-Token erstellen

1. In Cloudflare **My Profile → API Tokens** oder **Manage Account → API Tokens**
   öffnen.
2. **Create Token** wählen.
3. Vorlage **Edit Cloudflare Workers** wählen.
4. Tokenname: `GitHub Actions – Tierarztpraxis Worker`.
5. Zugriff auf genau das verwendete Cloudflare-Konto und die Zone `telacore.org`
   begrenzen.
6. Zusammenfassung prüfen und Token erstellen.
7. Token sofort in einen Passwortmanager übernehmen; es wird nur einmal vollständig
   angezeigt.

Keinen Global API Key verwenden.

### GitHub-Environments und Secrets

Im Repository:

1. **Settings → Environments** öffnen.
2. Environment `cloudflare-development` erstellen.
3. Environment `cloudflare-production` erstellen.
4. In **beiden** Environments unter **Environment secrets** anlegen:

   ```text
   CLOUDFLARE_ACCOUNT_ID
   CLOUDFLARE_API_TOKEN
   ```

5. Für `cloudflare-production` nach Möglichkeit einen Required Reviewer und eine
   Deployment-Freigabe konfigurieren.

Die Secret-Namen müssen exakt mit dem Workflow übereinstimmen. Der Wert des Tokens
gehört niemals in eine Workflowdatei.

## 12. Entwicklungs-Worker aus GitHub Actions veröffentlichen

Der manuelle Workflow funktioniert erst, wenn die Workflowdatei auf dem Default-Branch
`main` liegt. Daher zuerst den geprüften Bootstrap-PR mergen.

Danach:

1. Im Repository den Tab **Actions** öffnen.
2. Workflow **Cloudflare Worker veröffentlichen** auswählen.
3. **Run workflow** wählen.
4. Branch `main` auswählen.
5. Environment `development` auswählen.
6. Workflow starten.
7. Die Schritte `check`, `test` und `wrangler deploy` kontrollieren.

Der Workflow bricht absichtlich ab, wenn noch KV-ID-Platzhalter vorhanden sind.

### API-Custom-Domain

Für einen Worker Custom Domain darf auf `api.tierarztpraxis-schaffer.telacore.org` kein
konkurrierender CNAME vorhanden sein. Falls du vorher manuell einen DNS-Eintrag für
`api` angelegt hast, lösche ihn vor dem ersten Deploy. Cloudflare erstellt den
benötigten DNS-Eintrag und das Zertifikat beim Worker-Custom-Domain-Setup selbst.

Da Entwicklung und Produktion dieselbe API-Adresse verwenden sollen, läuft immer nur
eine der beiden Umgebungen auf diesem Hostnamen. Zunächst wird `development`
veröffentlicht. Bei der Produktionsfreigabe übernimmt der Produktions-Worker diesen
Hostnamen. Für parallelen Betrieb wäre später eine zusätzliche Adresse wie
`api-dev.tierarztpraxis-schaffer.telacore.org` erforderlich.

### Nach dem Deploy testen

Gesundheitsprüfung:

```bash
curl -i https://api.tierarztpraxis-schaffer.telacore.org/health
```

Erwartet:

```text
HTTP/2 200
```

Anschließend das Kontaktformular im Browser benutzen, weil dort ein gültiger
Turnstile-Token erzeugt wird. Kontrollieren:

- Testmail trifft bei `tierarztpraxis_schaffer@herr-der-mails.de` ein;
- Absender ist die konfigurierte Website-Adresse;
- Reply-To zeigt nur bei gültiger Eingabe auf die Absenderadresse;
- keine Nachrichtendaten erscheinen in Worker-Logs;
- eine zweite Verwendung desselben Turnstile-Tokens wird abgelehnt;
- bei nicht erreichbarem Worker bleibt die Telefonnummer sichtbar.

## 13. Development-Ressourcen für den Datentransfer

Stand 2026-08-11 ist die Development-D1-Datenbank mit EU-Jurisdiktion angelegt:

- Name: `tierarztpraxis-schaffer-transfer-development`;
- ID: `27da967d-21c2-4a37-98a1-9e6cfd7451a1`;
- Binding: `TRANSFER_DB`;
- Migrationen: `worker/migrations`, erstmals in Task 14.

Außerdem bestehen Hauptqueue und Dead-Letter-Queue:

- `tierarztpraxis-transfer-notifications-development`;
- `tierarztpraxis-transfer-notifications-dlq-development`.

`TRANSFER_NOTIFICATIONS` produziert in die Hauptqueue. Der Worker ist auch als Consumer
der Hauptqueue mit der zweiten Queue als `dead_letter_queue` konfiguriert. Batch-,
Timeout- und Retry-Tuning bleiben bis Task 24 bei den Wrangler-Defaults.

Die tägliche Cron Expression lautet `0 3 * * *`, also 03:00 UTC. Task 25 implementiert
den Handler. Die Route `tierarztpraxis-schaffer.telacore.org/api/*` ist mit Zone
`telacore.org` deklariert und mit dem Development-Deployment vom 11.08.2026 aktiv. Die
Hauptqueue hat einen Producer und einen Consumer; die DLQ ist als Dead-Letter-Ziel
verbunden.

### R2 aktiviert und Development-Bucket angelegt

R2 wurde im Cloudflare-Dashboard aktiviert. Der read-only Aufruf

```bash
cd worker
pnpm exec wrangler r2 bucket list --jurisdiction eu
```

listet nun den privaten Bucket `tierarztpraxis-schaffer-transfer-development` in der
EU-Jurisdiktion. `r2.dev` ist deaktiviert, es sind keine Custom Domains verbunden und
die Standard Storage Class ist `Standard`. Die Lifecycle-Regel `expiry-60-days` löscht
Objekte nach 60 Tagen; der Bucket ist leer.

Die ausgeführten Prüf- und Einrichtungsschritte waren:

```bash
pnpm exec wrangler r2 bucket create \
  tierarztpraxis-schaffer-transfer-development \
  --jurisdiction eu \
  --storage-class Standard
pnpm exec wrangler r2 bucket info \
  tierarztpraxis-schaffer-transfer-development \
  --jurisdiction eu \
  --json
pnpm exec wrangler r2 bucket dev-url get \
  tierarztpraxis-schaffer-transfer-development \
  --jurisdiction eu
pnpm exec wrangler r2 bucket domain list \
  tierarztpraxis-schaffer-transfer-development \
  --jurisdiction eu
pnpm exec wrangler r2 bucket lifecycle add \
  tierarztpraxis-schaffer-transfer-development \
  expiry-60-days \
  --expire-days 60 \
  --jurisdiction eu \
  --force
pnpm exec wrangler r2 bucket lifecycle list \
  tierarztpraxis-schaffer-transfer-development \
  --jurisdiction eu
```

`worker/wrangler.jsonc` enthält den vorgesehenen lokalen R2-Bindingnamen
`TRANSFER_FILES` bereits, aber kein `remote: true` und keine öffentliche URL. Die
Development-Konfiguration deklariert insgesamt nur die sechs Secret-Namen
`TURNSTILE_SECRET`, `RATE_LIMIT_SALT`, `TOKEN_PEPPER`, `SESSION_PEPPER`,
`ACCESS_TEAM_DOMAIN` und `ACCESS_ADMIN_API_AUD`. Werte werden erst nach den Access-
Schritten in Task 28 gesetzt und niemals in diese Dokumentation geschrieben.

## 14. Development-Secrets und Cloudflare Access freigeben

### Access-Anwendungen

Für den Development-Worker sind zwei getrennte Self-hosted-Access-Anwendungen
vorgesehen:

1. `tierarztpraxis-schaffer-admin-ui` für Host `tierarztpraxis-schaffer.telacore.org`
   und Pfad `/admin/*`;
2. `tierarztpraxis-schaffer-admin-api` für denselben Host und Pfad `/api/admin/*`.

Beide Anwendungen sind am 11.08.2026 angelegt und geschützt. Die Policies erlauben
ausschließlich die freigegebene Admin-E-Mail-Adresse; weder `Everyone` noch
`all valid emails` ist enthalten. Die konfigurierte OTP-Organisation stellt den Login
bereit, die Sessiondauer beträgt vier Stunden.

Aus der Access-Team-Konfiguration werden danach zwei Werte übernommen:

- `ACCESS_TEAM_DOMAIN`: ausschließlich der HTTPS-Teamhost unter
  `*.cloudflareaccess.com`;
- `ACCESS_ADMIN_API_AUD`: der Audience Tag der API-Anwendung
  `tierarztpraxis-schaffer-admin-api`.

### Secretwerte setzen

Der Development-Stand enthält seit dem 11.08.2026 alle sechs Secret-Namen:
`RATE_LIMIT_SALT`, `TURNSTILE_SECRET`, `TOKEN_PEPPER`, `SESSION_PEPPER`,
`ACCESS_TEAM_DOMAIN` und `ACCESS_ADMIN_API_AUD`. Werte niemals committen, in
Shell-Historien speichern oder in diese Dokumentation schreiben. Die beiden Pepper
wurden als neue zufällige Werte gesetzt; Team-Domain und Audience stammen aus Access.
Für eine neue Umgebung:

```bash
cd worker
openssl rand -hex 32
pnpm exec wrangler secret put TOKEN_PEPPER --env development
openssl rand -hex 32
pnpm exec wrangler secret put SESSION_PEPPER --env development
pnpm exec wrangler secret put ACCESS_TEAM_DOMAIN --env development
pnpm exec wrangler secret put ACCESS_ADMIN_API_AUD --env development
pnpm exec wrangler secret list --env development
```

Die letzte Abfrage darf nur die sechs Secret-Namen zeigen. Der Development-Deploy wurde
anschließend ausgeführt und ist in Version `fc3b44df-bb8c-462b-9b4b-f98db6ebce6b` aktiv:

```bash
pnpm exec wrangler deploy --env development
pnpm exec wrangler queues list
```

Nach dem Deploy müssen Queue-Producer und Consumer eingetragen sein und der Healthcheck
antworten. Beides ist für Development bestätigt; die vollständige Remote-E2E mit
interaktivem Access-OTP steht noch aus. Produktion bleibt unverändert.

## Häufige Fehler

### `Authentication error` oder Fehlercode 10000

- Account-ID falsch;
- Token falsch kopiert;
- Token ist abgelaufen;
- Token hat nicht die Vorlage beziehungsweise Berechtigungen für Workers;
- GitHub-Secret liegt im falschen Environment.

### KV-Binding nicht gefunden

- falsche Namespace-ID;
- Binding heißt nicht exakt `CONTACT_CONFIG`;
- `--env=development` vergessen;
- Wert nur lokal statt mit `--remote` geschrieben.

### E-Mail wird abgelehnt

- Zieladresse noch nicht verifiziert;
- Absenderdomain noch nicht für Email Sending eingerichtet;
- `MAIL_FROM` gehört nicht zur eingerichteten Domain;
- Send-Binding fehlt;
- Tippfehler im KV-Wert.

### Custom Domain kann nicht angelegt werden

- auf `api.tierarztpraxis-schaffer.telacore.org` existiert bereits ein CNAME;
- die Zone liegt in einem anderen Cloudflare-Konto;
- API-Token ist nicht auf die Zone berechtigt;
- der Hostname ist bereits einem anderen Worker zugeordnet.
