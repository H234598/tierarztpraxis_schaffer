# Task 14 Report – D1-Migration

Status: lokal fertig, Remote-Migration wartet auf manuelle Bestätigung

## Umsetzung

- `worker/migrations/0001_datatransfer.sql` bildet §17 unverändert ab, einschließlich korrigierter FK-Kante `transfer_submissions.case_id REFERENCES transfer_cases(id) ON DELETE CASCADE`.
- Neun Fachtabellen und sechs benannte Indizes angelegt.
- Paket-Skripte `d1:migrate:local` und `d1:migrate:development` ergänzt.
- Schema-Integrationstest nutzt nur Node-Stdlib und installiertes Wrangler. Jeder Lauf erhält eigenen `mkdtemp`-State außerhalb des Repositories; Aufräumen validiert Pfad und Symlink-Grenze.
- `@types/node` ist exakt auf `24.13.3` gepinnt. Produktions-`tsconfig.json` prüft weiterhin nur Worker-Quellen ohne Node-Globals; `tsconfig.test.json` ergänzt Node-Typen ausschließlich für Tests.

## TDD- und Verifikationsevidenz

- RED vor Migration: gezielter Schema-Lauf Exit 1, 4/4 Tests rot; Wrangler erzeugte ohne Migration keine nutzbare lokale D1-Datenbank.
- GREEN nach Migration: `pnpm --dir worker exec vitest run test/schema.test.ts`, 4/4.
- `sqlite_schema`: neun Fachtabellen plus `d1_migrations`; alle sechs erwarteten `idx_transfer_*`-Indizes.
- Constraints: Status, Boolean, Länge, Größe, eindeutige `public_id`, eindeutige Token-HMAC sowie Foreign-Key-Rejection.
- Kaskade: Fall, Token, Session, Submission, Datei, Link, Reply und Notification werden entfernt; Audit-Ereignis bleibt mit `case_id = NULL`.
- Idempotenz: zweiter Wrangler-Apply auf identischem isolierten State meldet `No migrations to apply`; `sqlite_schema` bleibt unverändert.
- Dokumentierter Paketlauf `pnpm --dir worker d1:migrate:local`: 17 SQL-Befehle erfolgreich.
- Lokale Migrationsliste: `No migrations to apply!`.
- `pnpm worker:check`: erfolgreich, einschließlich separater Production- und Test-Typechecks.
- `pnpm --dir worker test`: 26/26.
- `pnpm test` unter dokumentierter Development-Testumgebung: 65/65 Website- und 26/26 Worker-Tests.
- Generierter `worker/.wrangler/state` nach Verifikation validiert und entfernt.
- Vault-Masterplan zuerst aktualisiert; Repo-Plan danach bytegleich synchronisiert.

## Remote-Grenze

Read-only Development-D1-Nachweis:

- Datenbank: `tierarztpraxis-schaffer-transfer-development` (`27da967d-21c2-4a37-98a1-9e6cfd7451a1`)
- Jurisdiktion: `eu`; laufende Region: `EEUR`
- Remote-Tabellen vor Migration: `0`
- aktueller Time-Travel-Bookmark: `00000001-00000000-000050bd-098c67ca6b334390ef3948b650c190ea`

Keine neue manuelle Bestätigung lag vor. Deshalb kein `d1:migrate:development`, kein Restore, kein Deployment, kein Production-Zugriff und keine R2-/Queue-Mutation. Task bleibt bis zum bestätigten Remote-Lauf teilweise offen.

Geplante Commitnachricht für lokalen Zwischenstand:

```text
feat: d1-schema für datentransfer anlegen
```
