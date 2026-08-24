# Task 17 Report – Berichte und Links

Status: abgeschlossen

## Umsetzung

- `worker/src/transfers/submissions.ts`: strikte Berichtseingabe mit Text-, Callback-, E-Mail-, Datei- und Anzahlgrenzen; acht erlaubte Medientypen mit 12-MiB-Bild- und 50-MiB-Videolimit; sichere Summenbildung.
- `worker/src/transfers/links.ts`: maximal acht Links, ausschließlich `https:`, keine URL-Credentials, begrenzte URL-/Labellängen und keine externen Abrufe.
- `POST /api/transfers/submissions`: exakte Origin, gültige Session, sessiongebundenes CSRF, JSON und 32-KiB-Bodylimit. `notEmergencyConfirmed` muss exakt `true` sein.
- Draft, Links, pending Files, Fallquotenreservierung und Zählerupdate laufen in genau einem D1-Batch. Prepared Statements binden ausschließlich Session-`case_id` und erzeugte Objekt-IDs.
- Bedingter Draft-Insert prüft offenen/nicht abgelaufenen Fall sowie aktuelle Submission-/Bytequote. Abhängige Link-/File-Inserts und Zählerupdate greifen nur auf denselben neuen Draft zu. Jedes Batch-Ergebnis verlangt `meta.changes === 1`; Batchfehler oder Quotenrace liefern keinen Erfolg.
- Alle IDs stammen aus `crypto.randomUUID()`. R2-Key ist exakt `cases/<case-id>/submissions/<submission-id>/<file-id>` und enthält nie den Originalnamen. Uploadslots laufen nach 24 Stunden ab.
- `POST /api/transfers/submissions/:id/finalize`: atomarer, gebundener Statuswechsel ausschließlich für eigenen `draft`; jede Datei muss `stored` und `stored_size` nicht null sein. `meta.changes !== 1` blockiert pending/rejected, fremden Fall und Replay generisch.
- Finalisierung ändert keine bereits reservierte Quote. Keine Queue-, E-Mail-, R2-, Vorschau- oder Link-Fetch-Operation.
- Bestehendes Transferfehlerformat und Securityheader werden wiederverwendet; unerwartete Fehler loggen weiterhin nur festes Event plus Request-ID.

## TDD und Verifikation

- RED 1: fokussierter Lauf scheiterte am fehlenden Modul `transfers/submissions`.
- GREEN Validatoren: 5/5 erste Grenzfälle.
- RED 2: acht API-Vertragsfälle scheiterten erwartungsgemäß mit `404` wegen fehlender Create-/Finalize-Routen.
- GREEN focused: `worker/test/submissions.test.ts`, 37/37.
- Validatorfälle decken Textgrenzen, Notfallbestätigung, Callbackregeln, strikte Objektform, HTTPS/Credentials, Link-/Fileanzahl, erlaubte MIME-Typen und typbezogene Größen ab.
- API-Fälle decken Origin/Session/CSRF, Happy Path, genau einen Batch/Zählerupdate, `changes=0`, Fallbytequote, Batchfehler, R2-Key, Slots, fehlenden Link-Fetch, Finalize-Happy-Path, pending/rejected, IDOR und Replay ab.
- `pnpm worker:check`: erfolgreich; Wrangler-Typen aktuell.
- `pnpm --dir worker test`: 130/130.
- `pnpm test` mit dokumentierter Development-Testumgebung: 65/65 Website- und 130/130 Worker-Tests.
- `git diff --check`: erfolgreich.

## D1-Vertrag und Scope

Geprüft wurden aktuelle offizielle Cloudflare-Dokumente und `@cloudflare/workers-types@5.20260804.1`. D1 führt Batch-Statements sequenziell und nicht nebenläufig als atomare SQL-Transaktion aus; ein Statementfehler rollt die gesamte Sequenz zurück. `batch()` liefert `D1Result[]` in Statementreihenfolge, `D1Result.meta.changes` die betroffenen Zeilen. Prepared Statements und `.bind()` verhindern Interpolation externer Werte.

Keine Migration, Dependency, Wrangler-/Cloudflare-, Frontend- oder Remote-Änderung. Keine Queue-, R2-, E-Mail- oder Link-Fetch-Schreiboperation. Production bleibt fail-closed.

Commit:

```text
feat: fallberichte und sichere links speichern
```
