# DATEV-Export — Schritt für Schritt

*English summary at the bottom.*

PaperCortex erzeugt echte DATEV-Format-Dateien (EXTF, Buchungsstapel Version 13),
die dein Steuerberater direkt in DATEV Rechnungswesen oder DATEV Unternehmen
Online importiert. Kein Nachbearbeiten, keine Excel-Bastelei.

## Was du vorher brauchst

Drei Angaben, alle bekommst du von deinem Steuerberater (eine kurze E-Mail genügt):

| Angabe | Beispiel | Was ist das? |
|---|---|---|
| Beraternummer | 29098 | Die DATEV-Nummer der Kanzlei |
| Mandantennummer | 55003 | Deine Nummer bei der Kanzlei |
| Kontenrahmen | SKR03 oder SKR04 | Welchen die Kanzlei für dich führt |

Optional: der Monat, in dem dein Wirtschaftsjahr beginnt (fast immer Januar),
und das Geldkonto für die Gegenbuchung (Vorgabe: 1200 bei SKR03, 1800 bei SKR04).

## Der einfachste Weg: die Einstellungsseite im Browser

Seit dieser Version bringt PaperCortex eine eingebaute Weboberfläche mit
(Standard: `http://<server>:8140`, bei Docker-Compose bereits freigegeben):

1. **Systemcheck** — zeigt mit Ampelfarben, ob Paperless-ngx, Ollama, die
   Modelle und die DATEV-Konfiguration stehen, inklusive konkretem
   Behebungshinweis bei Rot.
2. **DATEV-Einstellungen** — Beraternummer, Mandantennummer, Kontenrahmen
   (SKR03/SKR04), Wirtschaftsjahr, Geldkonto und optionale Kontenzuordnung.
   Jede Eingabe wird sofort validiert; gespeichert wird in
   `data/config.json` (dieselbe Datei, die auch `npm run datev:init` schreibt).
3. **Belege exportieren** — Monat wählen, Belege laden, per Knopf analysieren
   (mit Fortschrittsbalken), Vorschau mit Warnungen prüfen, einzelne Belege
   abwählen, DATEV-Datei herunterladen.

Standardmäßig ist die Seite nur von `localhost` aus erreichbar. Für den
Zugriff aus dem LAN (z. B. UnRaid-Server): im Compose-File das Port-Mapping
auf `"8140:8140"` ändern und in der `.env` einen Zugangscode
(`WEBUI_TOKEN`) plus die erlaubten Hostnamen setzen
(`WEBUI_ALLOWED_HOSTS=unraid.local,192.168.1.50` — das ist der Schutz gegen
DNS-Rebinding). Öffentlich ins Internet gehört dieser Port nie.
Abschalten: `WEBUI_ENABLED=false`.

Wer lieber im Terminal arbeitet: die drei CLI-Schritte unten führen zum
identischen Ergebnis.

## Die drei Schritte

### 1. Einmalig einrichten

```bash
npm run datev:init
```

Der Assistent fragt die Werte einzeln ab, prüft jede Eingabe sofort und
speichert alles in `data/config.json`. Falsche Eingaben werden erklärt und
erneut abgefragt — man kann hier nichts kaputt machen.

### 2. Probelauf (empfohlen)

```bash
npm run datev:check -- --month 2026-08
```

Zeigt, was exportiert **würde**: jede Buchung, jede Warnung (z. B. „kein
Steuersatz erkannt, 19% angenommen") und jeden Beleg, der NICHT exportiert
wird, mit dem genauen Grund. Es wird nichts geschrieben.

### 3. Exportieren

```bash
npm run datev:export -- --month 2026-08
```

Schreibt eine Datei `EXTF_Buchungsstapel_…csv` nach `./exports` (eine Datei
pro Wirtschaftsjahr, falls der Zeitraum zwei Jahre berührt — DATEV verlangt
das). Diese Datei schickst du deinem Steuerberater oder importierst sie
selbst: **Bestand → Importieren → „DATEV-Format" → Datei auswählen.**

## Welche Belege werden exportiert?

Alle Paperless-Dokumente mit dem Beleg-Tag (Standard: `receipt`, im
Assistenten änderbar) im gewählten Zeitraum. Alternativ:

```bash
npm run datev:export -- --from 2026-07-01 --to 2026-09-30   # Zeitraum
npm run datev:export -- --ids 123,456                        # einzelne Belege
npm run datev:check  -- --month 2026-08 --refresh            # Cache ignorieren
```

Die KI-Extraktion je Beleg wird lokal gecacht (`data/receipts.db`), der
zweite Lauf ist darum sofort fertig.

## Grundsätze (warum der Export „langweilig" korrekt ist)

- **Nie stillschweigend falsch buchen.** Ein Beleg mit unlesbarem Datum,
  negativem Betrag oder Fremdwährung wird übersprungen und im Bericht
  genannt — niemals geraten.
- **Warnung statt Bauchgefühl.** Fehlender Steuersatz, unbekannte Kategorie
  oder unsichere Erkennung erzeugen eine sichtbare Warnung an der Buchung.
- **Kontovorschläge sind Vorschläge.** Die Zuordnung Kategorie → Konto
  (SKR03/SKR04, siehe unten) ist ein sinnvoller Standard. Dein Steuerberater
  kann jedes Konto überschreiben (`accountOverrides` in `data/config.json`).
- Die Dateien sind CP1252-kodiert („ANSI") mit Umlauten und Eurozeichen —
  genau so, wie der DATEV-Import es erwartet. Festschreibung ist auf 0
  gesetzt, damit die Kanzlei den Stapel vor der Festschreibung prüfen kann.

## Kontenzuordnung (Standard)

| Kategorie | SKR03 | SKR04 |
|---|---|---|
| office_supplies | 4930 | 6815 |
| travel | 4660 | 6650 |
| food | 4650 | 6640 |
| telephone | 4920 | 6805 |
| postage | 4910 | 6800 |
| insurance | 4360 | 6400 |
| rent | 4210 | 6310 |
| advertising | 4600 | 6600 |
| software | 4964 | 6837 |
| hardware | 4985 | 6845 |
| consulting | 4957 | 6825 |
| training | 4945 | 6821 |
| vehicle | 4500 | 6520/6530 |
| alles andere | 4900 | 6300 |

Override-Beispiel in `data/config.json`:

```json
{
  "datev": {
    "accountOverrides": { "travel": "4670", "default": "4980" }
  }
}
```

## Wenn etwas hakt

| Symptom | Ursache und Lösung |
|---|---|
| „DATEV ist noch nicht eingerichtet" | `npm run datev:init` ausführen. |
| „Tag ‚receipt' nicht gefunden" | In Paperless einen Tag für Belege anlegen und die Belege taggen, oder im Assistenten den vorhandenen Tag-Namen angeben. |
| Beleg fehlt im Export | Der Bericht nennt den Grund je Beleg (Datum, Betrag, Währung). Beleg in Paperless korrigieren, `--refresh` laufen lassen. |
| DATEV meldet Importfehler zum Header | Datei nicht in Excel geöffnet und neu gespeichert? Excel zerstört Kodierung und Format — die CSV immer unverändert weitergeben. |
| Umlaute kaputt beim Steuerberater | Gleiches Thema: Datei unverändert lassen; PaperCortex schreibt korrektes ANSI/CP1252. |
| Buchungen im falschen Jahr | Wirtschaftsjahresbeginn im Assistenten prüfen (`npm run datev:init` erneut ausführen überschreibt sauber). |

Docker/UnRaid-Hinweis: Die Kommandos laufen im PaperCortex-Container
(`docker exec -it papercortex npm run datev:init`). `data/` und `exports/`
als Volumes mappen, damit Konfiguration und Exportdateien den Container
überleben.

---

## English summary

Get three values from your tax advisor (consultant number, client number,
SKR03/SKR04), run `npm run datev:init` once, preview with
`npm run datev:check -- --month 2026-08`, export with
`npm run datev:export -- --month 2026-08`. The resulting
`EXTF_Buchungsstapel_*.csv` imports directly into DATEV. Broken receipts are
skipped and reported with reasons, never guessed. Account mappings are
suggestions and can be overridden per category in `data/config.json`.
