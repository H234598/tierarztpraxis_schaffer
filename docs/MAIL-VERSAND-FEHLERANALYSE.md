---
tags:
  - projekt/tierarztpraxis-schaffer
  - cloudflare
  - turnstile
  - email-service
  - troubleshooting
type: troubleshooting
status: in-progress
updates: 2026-08-04
date: 2026-08-04
aliases:
  - Kontaktformular Mailversand Fehleranalyse
created: 2026-08-04
title: Kontaktformular – Mailversand-Fehleranalyse
---

# Kontaktformular – Mailversand-Fehleranalyse

## Festgestellte Hauptursache

Der GitHub-Pages-Workflow durfte bisher still auf Cloudflares öffentliches
Test-Sitekey zurückfallen:

```text
1x00000000000000000000AA
```

Der veröffentlichte Worker wurde dagegen mit dem echten Secret eines
Turnstile-Widgets konfiguriert. Cloudflare akzeptiert Dummy-Tokens nur mit dem
korrespondierenden Dummy-Secret. Ein echtes Secret weist Dummy-Tokens ab.
Dadurch endet die Anfrage vor dem E-Mail-Versand mit
`security_check_failed`.

## Reparatur

- Pages-Deployment benötigt zwingend `PUBLIC_TURNSTILE_SITE_KEY` als GitHub
  Actions Variable.
- Leere Werte und Cloudflare-Test-Sitekeys blockieren das Deployment.
- Dummy-Schlüssel bleiben ausschließlich für lokale beziehungsweise
  automatisierte Tests erlaubt.
- Website-Sitekey und Worker-Secret müssen immer vom selben Turnstile-Widget
  stammen.

## Erforderliche GitHub-Variable

Im Repository:

```text
Settings
→ Secrets and variables
→ Actions
→ Variables
→ New repository variable
```

Name:

```text
PUBLIC_TURNSTILE_SITE_KEY
```

Wert: das öffentliche Sitekey desselben Turnstile-Widgets, dessen Secret im
Development-Worker als `TURNSTILE_SECRET` gespeichert ist.

Das Sitekey ist ein öffentlicher Bezeichner und kein Secret. Das zugehörige
Secret darf ausschließlich in Cloudflare gespeichert bleiben.

## Nachweis

Nach der Korrektur muss der Pages-Workflow erfolgreich durchlaufen. Danach
muss eine Formularanfrage entweder:

- `202 accepted` liefern und den E-Mail-Versand auslösen, oder
- einen eindeutigen Fehlercode zurückgeben.

Cloudflare-Dummy-Schlüssel dürfen nicht mehr in die öffentliche Website gebaut
werden.
