# Inventar der alten Testseite

**Quelle:** hochgeladenes ZIP `Die Eröffnung ist da_files.zip`  
**Zweck:** nachvollziehbare Migration von Praxisdaten, Textbausteinen, Marke und Bildern  
**Wichtig:** Ein Eintrag in diesem Inventar ist noch keine fachliche oder rechtliche Produktionsfreigabe.

## 1. Dateien

| Datei | Größe | Inhalt | Migrationsentscheidung |
|---|---:|---|---|
| `0cb2a04d-6ab9-4e65-95e8-00af20fbfe60.jpg` | 283.786 B | Eröffnungsplakat mit Logo, Slogan, Datum und Kontaktdaten | als Markenreferenz und optional für eine Eröffnungschronik; vorher Metadaten entfernen und optimieren |
| `Die Eröffnung ist da.mhtml` | 7.142 B | gespeicherte Joomla-Seite mit Texten, Öffnungszeiten und Metadaten | nur semantische Inhalte extrahieren; Datei nicht veröffentlichen |
| `facebookQR.jpg` | 26.431 B | Facebook-QR-Code | optional nach Zielprüfung übernehmen; direkter Link bleibt primär |
| `instaQR.jpg` | 185.766 B | Instagram-QR-Code mit sichtbarem Handle | optional nach Zielprüfung übernehmen; direkter Link bleibt primär |
| `colors_standard.min.css` | 235 B | Joomla-Farbdatei | nicht übernehmen |
| `core.min.js` | 7.786 B | Joomla-Core-JavaScript | nicht übernehmen |
| `joomla-alert.min.css` | 6.075 B | Joomla-Komponentenstil | nicht übernehmen |
| `joomla-fontawesome.min.css` | 102.652 B | Iconfont-Stile | nicht übernehmen |
| `messages.min.js` | 5.542 B | Joomla-Nachrichtenlogik | nicht übernehmen |
| `template.min.css` | 253.151 B | altes Joomla-Template | nicht übernehmen |
| `template.min.js` | 979 B | altes Template-JavaScript | nicht übernehmen |

## 2. Erkannte Praxisdaten

| Kategorie | erkannter Wert | Quelle | Prüfstatus |
|---|---|---|---|
| vollständiger Name | Tierarztpraxis Dr. Michael Schäffer | MHTML/Schema und Plakat | zu bestätigen |
| Telefon | 0911 - 63 29 29 83 | Plakat | zu bestätigen |
| Straße | Friedrich-Ebert-Straße 17 | Plakat | zu bestätigen |
| PLZ/Ort | 90766 Fürth | Plakat | zu bestätigen |
| Eröffnungsdatum | 02.02.2026 | Plakat | zu bestätigen |
| öffentliche Alt-E-Mail | info@tierarzt-praxis-schäffer.de | Plakat | nur als historische Quelle; neue Anzeigeadresse festlegen |
| alte Domain | www.tierarzt-praxis-schäffer.de | Plakat | Kontrolle und mögliche Weiterleitung prüfen |
| Montag | 08:00–19:00 | MHTML | zu bestätigen |
| Dienstag | 09:00–19:00 | MHTML | zu bestätigen |
| Mittwoch | 09:00–19:00 | MHTML | zu bestätigen |
| Donnerstag | 09:00–19:00 | MHTML | zu bestätigen |
| Freitag | 08:00–19:00 | MHTML | zu bestätigen |
| Samstag | 10:00–17:00 | MHTML | zu bestätigen |
| Samstag | Notfallsprechstunde, erhöhter Gebührensatz (GOT) | MHTML | fachlich/rechtlich bestätigen |
| Terminregel | „Wir bitten stets um telefonische Voranmeldung.“ | MHTML | bestätigen |
| Instagram | `tierarztpraxis_dr_schaeffer` | QR-Grafik | URL und Eigentümerschaft bestätigen |
| Facebook | QR-Seiten-ID `61587199954668` | QR-Code | öffentliche Seite bestätigen |

## 3. Erkannte Textbausteine

### Altseite

```text
Endlich ist der Tag der Eröffnung gekommen, die Homepage befindet sich
allerdings noch im Aufbau.

Bis es soweit ist können Sie uns gerne bereits auf Instagram und
Facebook folgen.

Vielen Dank und bis bald.
Ihr Praxisteam Dr. Schäffer
```

Dieser Text wird nicht als aktuelle Startseitenbotschaft übernommen. Er ist zeitgebunden und die Website soll nicht mehr als „im Aufbau“ erscheinen.

### Plakat

```text
Aus Leidenschaft
Für Ihren Liebling
Für Sie
```

```text
Ab dem 02.02.2026 sind wir mit Herz, Kompetenz und moderner Tiermedizin
für Ihre Lieblinge da.
```

Daraus wird eine zeitlose, sachliche Markenbotschaft entwickelt:

```text
Mit Herz, Kompetenz und moderner Tiermedizin.
Aus Leidenschaft für Ihren Liebling – persönlich für Sie da.
```

Die finale Formulierung benötigt die Freigabe der Praxis.

## 4. Bild- und Markenbeobachtungen

- Logo als runder Stempel mit Tiergesichtern/Pfoten;
- Primärfarbe Grün;
- Sekundärfarben Mint, Türkis, Hellgrün und Grau;
- aquarellartige Blätter und Pfoten als Hintergrundmotive;
- freundliche, persönliche statt klinisch-kalte Tonalität.

Für die Website wird das Erscheinungsbild ruhiger und kontrastreicher umgesetzt. Hintergrundmotive dürfen keine Lesbarkeit beeinträchtigen. Das Logo sollte nicht aus dem JPEG ausgeschnitten werden, sobald eine saubere Vektorquelle verfügbar ist.

## 5. Geplante Zielpfade

```text
src/assets/legacy/opening-poster.jpg
src/assets/social/instagram-qr.jpg
src/assets/social/facebook-qr.jpg
src/assets/brand/logo.svg              # TODO: saubere Originaldatei
src/assets/practice/                   # TODO: echte Praxisfotos
src/assets/team/                       # TODO: freigegebene Teamfotos
```

Die Originaldateien werden nicht ungeprüft direkt nach `public/` kopiert. Eine Build-Pipeline erzeugt optimierte Formate und feste Bildabmessungen.

## 6. Noch zu beschaffende Informationen

- endgültiger Praxisname für Header und Impressum;
- öffentliche E-Mail-Adresse;
- fachlich bestätigte Leistungen und behandelte Tierarten;
- Teammitglieder, Funktionen, Qualifikationen und Freigabetexte;
- Notfallregelung außerhalb der Öffnungszeiten;
- Bestätigung der Samstagsregel und GOT-Formulierung;
- OSM-Koordinaten;
- Parkplätze, ÖPNV und Fahrradabstellmöglichkeiten;
- stufenloser Zugang, Türbreiten, Aufzug, WC und weitere Angaben zur baulichen Barrierefreiheit;
- Tierärztekammer, Aufsichtsbehörde, Berufsrecht und gegebenenfalls Berufshaftpflicht;
- sauberes Logo und Bildrechte;
- aktive Stellen beziehungsweise Regel für Initiativbewerbungen;
- bestätigte Instagram- und Facebook-URLs;
- Zugriff auf die alte Domain für eine Weiterleitung.

Nicht ermittelbare Punkte werden im Entwicklungsstand als konkrete `TODO:`-Platzhalter angelegt und blockieren erst den Produktionsbuild.
