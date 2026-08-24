# Datentransfer-Betrieb

## Status 2026-08-11

Die freigegebene Development-D1-Migration ist remote angewendet und die neun
Datentransfer-Tabellen sind in `EEUR` bestätigt. Der private Development-R2-Bucket
besitzt die aktive 60-Tage-Lifecycle-Regel. Der integrierte Worker ist in Version
`fc3b44df-bb8c-462b-9b4b-f98db6ebce6b` deployed; Healthcheck, Hauptqueue-Producer und
Queue-Consumer sind remote bestätigt. Die beiden Development-Access-Anwendungen sind mit
expliziter Admin-E-Mail-Policy und vier Stunden Sessiondauer eingerichtet. Alle sechs
Development-Secret-Namen sind gesetzt; Secretwerte werden hier nicht notiert. Produktion
blieb unverändert.

Der read-only Integritätsvorcheck am 11.08.2026 meldete für `PRAGMA foreign_key_check`
keine Befunde. Die neun Transfer-Tabellen der produktiven Development-Datenbank
enthalten derzeit null Zeilen; die Abfragen wurden in `EEUR` primär bedient und meldeten
null Schreibvorgänge. Der Ausgangszustand der produktiven Development-Datenbank blieb
auch während der Restoreübung unverändert.

Die tägliche Wartung ist in `worker/src/scheduled/maintenance.ts` gebündelt und wird vom
`scheduled`-Handler des Worker-Entrypoints aufgerufen. Sie räumt abgelaufene Sessions
und Tokens, alte Drafts, abgelaufene R2-Dateien, alte nicht referenzierte R2-Objekte
sowie geschlossene/abgelaufene Fälle nach `delete_after` auf. R2 wird vor dem
D1-Zustandswechsel gelöscht; fehlerhafte oder unvollständige Datensätze werden
übersprungen und ohne sensible Details geloggt. Nicht referenzierte Objekte werden nur
unter `cases/` und nach einer 24-Stunden-Schutzfrist berücksichtigt.

Notification-Reconciliation (pending/queued/failed gegen Queue/DLQ) benötigt weiterhin
eine explizite Queue-/DLQ-Betriebsentscheidung; lokal werden veraltete Zustände wieder
für einen Retry freigegeben. Die R2-Orphan-Inventur läuft im Scheduled-Handler nur
innerhalb der sicheren Prefix-/Schutzfristgrenzen. Die D1-Time-Travel-Restoreübung ist
ein manueller Remote-Vorgang. Sie wurde am 11.08.2026 in einer isolierten, danach
gelöschten D1-Datenbank mit anonymisierten Stichprobendaten durchgeführt und
verifiziert; die produktive Development-Datenbank wurde nicht restauriert.

Für R2 ist zusätzlich eine Lifecycle-Regel „löschen nach 60 Tagen“ im EU-Bucket zu
konfigurieren und vor Produktionsfreigabe nachzuweisen. Die Anwendung löscht
fallbezogene Objekte früher nach `delete_after`, wenn die rechtliche Aufbewahrung dies
erlaubt; die 60-Tage-Regel bleibt der technische maximale Fallback und ersetzt keine
Freigabeentscheidung.

Restore-Übung: isolierte D1-Zieldatenbank anlegen, einen dokumentierten
Time-Travel-/Backup-Stand wiederherstellen, `d1 migrations list` und Fremdschlüssel
prüfen, anschließend anonymisierte Stichprobendaten für Fall, Token, Session, Datei und
Notification abgleichen und das Ergebnis samt Zeitstempel protokollieren. Kein Restore
in die produktive Datenbank ohne separate Freigabe. Diese Übung wurde mit dem isolierten
Ziel `tierarztpraxis-schaffer-transfer-restore-exercise-20260811` erledigt: Der direkte
`finalBookmark` des SQL-Imports stellte alle neun Tabellen mit je einer Stichprobe
wieder her; `PRAGMA foreign_key_check` blieb leer, der absichtlich nach dem Bookmark
veränderte Fall kehrte auf `status = open` zurück und das Audit-Ereignis war wieder
vorhanden. Die temporäre Datenbank wurde anschließend gelöscht.

Der sichere read-only Vorcheck mit der installierten Wrangler-Version lautet:

```bash
pnpm --dir worker exec wrangler d1 time-travel info TRANSFER_DB \
  --env development \
  --timestamp <RFC3339-Zeitpunkt> \
  --json
```

`wrangler d1 time-travel restore TRANSFER_DB --env development` wirkt direkt auf die
benannte Remote-Datenbank. Deshalb wurde ausschließlich das isolierte Ziel restauriert;
`TRANSFER_DB` blieb unangetastet. Der aktuelle CLI-Help weist für `restore` nur Bookmark
oder Zeitstempel aus; für die Übung wurde deshalb der von Wrangler direkt ausgegebene
`finalBookmark` des SQL-Imports verwendet.

Vor einem Remote-Lauf manuell prüfen:
`wrangler d1 migrations list TRANSFER_DB --remote --env development`, R2-Objektinventur
und Queue/DLQ-Zustand. Die D1-Migration, R2-Lifecycle-Einrichtung, Development-Secrets
und das Development-Worker-Deployment sind als freigegebene Development-Änderungen
ausgeführt. Die vollständige Remote-E2E mit interaktivem Access-OTP bleibt als
Abnahmeschritt offen; Produktionsänderungen bleiben bis zur fachlichen und rechtlichen
Freigabe aus.
