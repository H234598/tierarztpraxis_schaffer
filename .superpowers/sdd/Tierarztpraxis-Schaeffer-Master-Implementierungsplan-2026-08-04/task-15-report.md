# Task 15 Report – sichere Datentransfer-Tokens und Sessions

Status: abgeschlossen

## Umsetzung

- `security/hmac.ts`: HMAC-SHA-256 als lowercase 64-Zeichen-Hex; nicht extrahierbare Schlüssel; Signaturformat vor Dekodierung strikt validiert; Verifikation über natives `crypto.subtle.verify()`.
- Canonical Base64URL: Web-API `atob`/`btoa`, kein Padding, erlaubtes Alphabet, Re-Encoding-Prüfung gegen nicht kanonische Restbits.
- Zufall: ausschließlich `crypto.getRandomValues()`, jeweils 32 Bytes für Token-, Session- und CSRF-Secrets; keine Node-Crypto-API und kein `Math.random()`.
- `transfers/tokens.ts`: Format `dt1_<publicCaseId>_<secret>`, genau zwei Separatoren, 12–16 RFC-4648-Base32-Zeichen, Generator mit 16 Zeichen aus zehn Zufallsbytes, 43-Zeichen-Secret, Hint aus exakt vier Schlusszeichen.
- Token-Storage enthält nur Public-ID, Version, HMAC und Hint. Verifikation liefert nur Boolean und behandelt Format, Public-ID, Version, HMAC, Widerruf, Grenzablauf und ungültige Daten fail-closed.
- `transfers/sessions.ts`: opaker 32-Byte-Cookiewert, nur domain-separierter HMAC in Storage, host-only `dt_session`, exakter Pfad und Securityattribute, eindeutiger strikter Cookieparser.
- Sessionlaufzeit: 30 Minuten Sliding Expiry, gedeckelt durch zwölf Stunden absolute Laufzeit; `now` ist injiziert.
- `security/csrf.ts`: 32-Byte-Token, Storage nur als `csrf-v1\0`-HMAC, native Verifikation, Rotation macht alten Token unwirksam.
- Domain Separation: `session-v1\0` und `csrf-v1\0` unter `SESSION_PEPPER`; Token-HMAC separat unter `TOKEN_PEPPER`.
- Keine Schlüssel-/Secret-Caches und keine Logs in Generator- oder Prüfpfaden.

## TDD und Verifikation

- RED: fokussierter Vitest-Lauf Exit 1; beide Suites scheiterten exakt an den fehlenden Modulen `security/hmac` und `security/csrf`.
- GREEN focused: `pnpm --dir worker exec vitest run test/token.test.ts test/session.test.ts`, 39/39.
- Bekanntes HMAC-SHA-256-Testvektor-Ergebnis geprüft; korrekt, falsch und malformed.
- Tokenfälle: Version, kurzes Secret, Whitespace, Punkt, zusätzlicher Unterstrich, Padding, nicht kanonisches Base64URL, ungültiges Base32, Round-trip und alle Stored-Record-Fehler.
- Sessionfälle: exakte Cookieattribute, host-only, Duplikat/Malformed, Sliding/Absolutgrenzen, Widerruf/Ablauf/Datenfehler und Domain Separation.
- CSRF: exakt 43 kanonische Zeichen aus 32 Bytes, korrekt/falsch/malformed, getrennte Domäne und Rotation.
- No-Logs-Spies decken Token-, Session- und CSRF-Generator-/Prüfpfade ab.
- `pnpm worker:check`: erfolgreich.
- `pnpm --dir worker test`: 66/66.
- `pnpm test` unter dokumentierter Development-Testumgebung: 65/65 Website- und 66/66 Worker-Tests.
- Vault-Masterplan zuerst aktualisiert; Repo-Plan bytegleich synchronisiert.

## Quellen und Scope

Geprüft wurden die aktuellen Cloudflare-Workers-Dokumente zu Web Crypto und Best Practices sowie die W3C Web Cryptography Level 2 Specification. Cloudflare dokumentiert HMAC für `sign()`/`verify()`, `crypto.getRandomValues()` und die globale `crypto.subtle`-Oberfläche.

Keine Änderung an Dependency, `wrangler.jsonc`, Migration, Router, Kontaktvertrag oder Frontend. Kein Secretwert, keine D1-/R2-/Queue-Mutation, kein Deployment und kein Production-Zugriff. Task-13-R2- und Task-14-Remote-Migrationsblock bleiben offen.

Commit:

```text
feat: sichere datentransfer-tokens und sessions
```
