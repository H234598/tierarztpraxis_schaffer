# Task 12 – Worker modularisieren

Status: abgeschlossen
Commit: `4eebd5c`
Commitnachricht: `refactor: worker für kontakt und datentransfer modularisieren`

## Ergebnis

- `worker/src/index.ts` ist schmaler Entrypoint und erzeugt pro Request genau einen `RouteContext`.
- Zentraler Router trennt `/health`, `/v1/contact` und 404.
- Kontaktcode liegt in `contact/route.ts`, `contact/validation.ts` und `contact/mail.ts`.
- Gemeinsame HTTP-Helfer liegen in `http/errors.ts`, `http/origin.ts` und `http/response.ts`.
- Turnstile und Rate-Limit-Key liegen in `security/turnstile.ts` und `security/rate-limit.ts`.
- `RouteContext` entspricht exakt der Masterplan-Schnittstelle.
- Wrangler erzeugt `worker-configuration.d.ts` aus Development- und Production-Konfiguration. Handgeschriebene Env-Duplikate entfallen.
- `secrets.required` nennt in beiden Environments nur `TURNSTILE_SECRET` und `RATE_LIMIT_SALT`; keine Secret-Werte wurden geschrieben oder committed.
- Kein Deployment und keine Cloudflare-Ressourcenänderung.

## Refactor-TDD

- Baseline: sechs bestehende Kontakt-Tests grün.
- Charakterisierung vor Produktionsumbau: 21 Kontakt-Regressionstests grün. Abgedeckt sind Health/404, Origin/CORS, Methoden und Content-Type, JSON/Bodylimit, Bot-Signal, Rate Limit, Validierungsreihenfolge, Turnstile, Empfängerwahl, Mailinhalt, Reply-To und strukturierte Logs.
- Struktur-RED: `worker/test/router.test.ts` scheiterte am fehlenden `src/router.ts`.
- GREEN: 21 Regressionstests plus ein Router-Strukturtest, insgesamt 22/22.
- Bestehende sechs Verträge bleiben enthalten; Statuscodes und Fehlerkörper unverändert.

## Verifikation

- `pnpm worker:check`: `wrangler types --check` aktuell; TypeScript ohne Fehler.
- `pnpm --dir worker test`: zwei Dateien, 22/22.
- `pnpm check`: 77 Dateien, 0 Fehler, 0 Warnungen, 0 Hinweise.
- Development-Build: 17 Seiten.
- `pnpm test`: 65 Website-Tests plus 22 Worker-Tests.
- Playwright: 76 bestanden, vier erwartete Desktop-only-Skips.
- Neue handgeschriebene Worker-TypeScript- und Testdateien: Prettier-Prüfung mit Print Width 88 grün.
- Remote-Healthcheck read-only: HTTP/2 200; `{"ok":true,"service":"tierarztpraxis-schaffer-contact","environment":"development"}`.
- Vault-/Repo-Masterplan bytegleich; SHA-256 `c31bb24ff165f5ea754b159edf04d8b21414137853231f8eddcf5e02d4214886`.
- Arbeitsbaum nach Commit sauber.

## Scope-Grenze und Restbedenken

- Remote-Health bestätigt bestehenden Development-Stand. Task 12 hat absichtlich nicht deployed; neuer Commit wird dadurch nicht remote validiert.
- Repository-`format:check` ist unabhängig von Task 12 durch bestehenden Default-Import von `prettier-plugin-astro` 0.14.1 blockiert: Paket exportiert keinen `default`.
- Datentransfer-Routen und Cloudflare-Ressourcen beginnen erst mit Task 13; Router enthält jetzt nur Health und bestehendes Kontaktformular.
- Generierte Runtime-Typen folgen Wrangler 4.107 und Compatibility Date 2026-07-16; bei Konfigurations- oder Wrangler-Änderungen `pnpm --dir worker types` erneut ausführen.
