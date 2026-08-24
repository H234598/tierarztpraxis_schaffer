---
title: Datenschutz-Entscheidungen für den Datentransfer
status: Arbeitsfassung – Freigabe ausstehend
updated: 2026-08-05
---

# Datenschutz-Entscheidungen für den Datentransfer

Dieses Dokument ist eine technische Arbeitsfassung. Es ist keine Rechtsberatung und darf
erst nach Prüfung durch Praxis und rechtlich zuständige Stelle als verbindliche
Information verwendet werden.

## Bereits aus dem Repository belegter Zweck

Das Portal soll fallbezogen die vertrauliche Übermittlung von Berichten, Bildern, Videos
und HTTPS-Links an die Praxis ermöglichen. Es gibt einen persönlichen Zugriffstoken,
einen optionalen Antwort-/Rückrufkontext und einen geschützten Verwaltungsbereich. Das
Portal ist kein Notfallkanal, stellt keine Diagnose oder Triage bereit und ist bis zur
Freigabe keine offizielle Praxis- oder Patientenakte.

## Technische Verarbeitung, datensparsam beschrieben

- D1 verarbeitet die für Fall, Status, Tokenbindung und Nachrichten erforderlichen
  Metadaten.
- R2 speichert übermittelte Dateien in einem privaten Objektspeicher; eine öffentliche
  Bucket-Adresse ist nicht vorgesehen.
- Eine Queue kann interne Verarbeitung und Wiederholung unterstützen.
- Cloudflare Access schützt Verwaltungsfunktionen.
- Ein Token wird zur Fallzuordnung verwendet und nicht im Klartext gespeichert.
  Tokenwerte, Geheimnisse und interne IDs gehören nicht in öffentliche Dokumentation
  oder Logs.
- Benachrichtigungs-E-Mails enthalten keine medizinischen Inhalte, Dateien,
  Berichtstexte oder Token.

## Vor Freigabe zu entscheiden

1. Zweck, Rechtsgrundlage und Informationspflicht für Portal, Uploads, Nachrichten und
   Benachrichtigungen.
2. Verantwortlichkeiten, Empfänger, Auftragsverarbeitung und eine etwaige
   Drittland-/Transferprüfung.
3. Aufbewahrungsdauer für Fälle, Nachrichten und Dateien sowie Löschlauf und
   R2-Lifecycle.
4. Zeitpunkt und Verfahren der Übernahme relevanter Inhalte in die offizielle
   Praxisakte; anschließend Löschung der Portal-Kopie.
5. Verfahren, Kontaktweg und Identitätsprüfung für Auskunft, Berichtigung, Löschung,
   Einschränkung, Datenübertragbarkeit und Widerspruch.
6. Verfahren für Datenpannen, Fehlübermittlungen und Notfälle.

Bis diese Punkte freigegeben sind, wird keine verbindliche Aufbewahrungsfrist zugesagt
und das Portal darf nicht als offizielle Akte oder Notfallweg beworben werden.
