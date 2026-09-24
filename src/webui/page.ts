/**
 * The browser page of the PaperCortex web UI, shipped as one self-contained
 * HTML string: no build step, no CDN, works offline in the home lab.
 *
 * Bilingual (de/en) via a small dictionary; the language toggle persists to
 * localStorage and reloads. Booking warnings and DATEV report lines stay
 * German on purpose: DATEV is a German-only accounting domain and those
 * strings travel into files a German tax advisor reads.
 */

export const PAGE_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PaperCortex</title>
<style>
  :root {
    --accent: #f97316; --accent-dark: #c2590b; --ink: #292524; --muted: #78716c;
    --paper: #faf7f2; --card: #ffffff; --line: #e7e0d8;
    --ok: #16a34a; --warn: #d97706; --fail: #dc2626;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font: 15px/1.55 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  }
  header {
    display: flex; align-items: baseline; gap: .55rem;
    padding: 1.4rem 2rem .9rem; border-bottom: 1px solid var(--line); background: var(--card);
  }
  header h1 { margin: 0; font-size: 1.25rem; letter-spacing: -.02em; }
  header h1 b { color: var(--accent); }
  header span { color: var(--muted); font-size: .82rem; }
  #lang-toggle { margin-left: auto; display: flex; gap: .3rem; }
  #lang-toggle button {
    appearance: none; cursor: pointer; font: inherit; font-size: .75rem; font-weight: 700;
    border: 1px solid var(--line); background: none; color: var(--muted);
    padding: .2rem .55rem; border-radius: 6px;
  }
  #lang-toggle button.active { border-color: var(--accent); color: var(--accent-dark); }
  nav { display: flex; gap: .25rem; padding: 0 2rem; background: var(--card); border-bottom: 1px solid var(--line); }
  nav button {
    appearance: none; border: 0; background: none; cursor: pointer; color: var(--muted);
    font: inherit; font-weight: 600; padding: .75rem .9rem; border-bottom: 2.5px solid transparent;
  }
  nav button.active { color: var(--ink); border-bottom-color: var(--accent); }
  main { max-width: 980px; margin: 0 auto; padding: 1.6rem 2rem 4rem; }
  section[hidden] { display: none; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 1.2rem 1.4rem; margin-bottom: 1.1rem; }
  .card h2 { margin: 0 0 .35rem; font-size: 1rem; }
  .hint { color: var(--muted); font-size: .82rem; margin: .1rem 0 .8rem; }
  label { display: block; font-weight: 600; font-size: .82rem; margin: .7rem 0 .2rem; }
  input, select {
    width: 100%; max-width: 26rem; padding: .5rem .6rem; font: inherit;
    border: 1px solid var(--line); border-radius: 7px; background: #fff;
  }
  input[type="checkbox"] { width: auto; }
  input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: 0; border-color: var(--accent); }
  .field-hint { color: var(--muted); font-size: .76rem; margin-top: .15rem; max-width: 30rem; }
  .field-error { color: var(--fail); font-size: .78rem; font-weight: 600; margin-top: .15rem; }
  .row { display: flex; flex-wrap: wrap; gap: 0 2rem; }
  .row > div { flex: 1 1 16rem; }
  button.primary {
    appearance: none; border: 0; cursor: pointer; font: inherit; font-weight: 700;
    background: var(--accent); color: #fff; padding: .6rem 1.3rem; border-radius: 8px; margin-top: 1rem;
  }
  button.primary:hover { background: var(--accent-dark); }
  button.primary:disabled { background: var(--line); color: var(--muted); cursor: default; }
  button.ghost {
    appearance: none; cursor: pointer; font: inherit; font-weight: 600; color: var(--accent-dark);
    background: none; border: 1px solid var(--line); padding: .45rem .9rem; border-radius: 8px;
  }
  .banner { border-radius: 8px; padding: .6rem .9rem; margin: .8rem 0; font-weight: 600; font-size: .86rem; }
  .banner.ok { background: #e8f6ec; color: var(--ok); }
  .banner.err { background: #fceceb; color: var(--fail); }
  ul.checks { list-style: none; margin: .4rem 0 0; padding: 0; }
  ul.checks li { display: flex; gap: .6rem; padding: .5rem 0; border-top: 1px solid var(--line); align-items: baseline; }
  ul.checks li:first-child { border-top: 0; }
  .dot { flex: 0 0 auto; width: .65rem; height: .65rem; border-radius: 50%; position: relative; top: .05rem; }
  .dot.ok { background: var(--ok); } .dot.warn { background: var(--warn); } .dot.fail { background: var(--fail); }
  .check-label { font-weight: 650; min-width: 13rem; }
  .check-detail { color: var(--muted); font-size: .84rem; }
  table { width: 100%; border-collapse: collapse; font-size: .85rem; margin-top: .6rem; }
  th { text-align: left; color: var(--muted); font-size: .74rem; text-transform: uppercase; letter-spacing: .05em; padding: .3rem .5rem; }
  td { padding: .42rem .5rem; border-top: 1px solid var(--line); vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .warn-note { color: var(--warn); font-size: .78rem; }
  .skip-note { color: var(--fail); font-size: .82rem; }
  .ok-note { color: var(--ok); font-size: .82rem; }
  .progress { height: .55rem; background: var(--line); border-radius: 4px; overflow: hidden; margin: .6rem 0; max-width: 26rem; }
  .progress > div { height: 100%; background: var(--accent); width: 0; transition: width .4s; }
  pre.report { background: #faf7f2; border: 1px solid var(--line); border-radius: 8px; padding: .8rem; font-size: .8rem; overflow-x: auto; white-space: pre-wrap; }
  a.download { display: inline-block; font-weight: 700; color: var(--accent-dark); margin: .3rem .8rem .3rem 0; }
  code { background: #f3efe9; padding: .05rem .3rem; border-radius: 4px; font-size: .85em; }
  .chip { display: inline-block; font-size: .68rem; font-weight: 700; padding: .05rem .4rem; border-radius: 5px; background: #f3efe9; color: var(--muted); }
</style>
</head>
<body>
<header>
  <h1>Paper<b>Cortex</b></h1><span data-i18n="subtitle"></span>
  <div id="lang-toggle"><button data-lang="de">DE</button><button data-lang="en">EN</button></div>
</header>
<nav>
  <button data-tab="doctor" class="active" data-i18n="tabDoctor"></button>
  <button data-tab="settings" data-i18n="tabSettings"></button>
  <button data-tab="export" data-i18n="tabExport"></button>
</nav>
<main>

<section id="tab-doctor">
  <div class="card">
    <h2 data-i18n="doctorTitle"></h2>
    <p class="hint" data-i18n="doctorHint"></p>
    <ul class="checks" id="doctor-list"><li><span class="check-detail" data-i18n="checking"></span></li></ul>
    <button class="ghost" id="doctor-rerun" data-i18n="recheck"></button>
    <button class="ghost" id="btn-index" style="margin-left:.5rem" data-i18n="buildIndex"></button>
    <div class="progress" id="index-progress" hidden><div></div></div>
    <div id="index-status" class="hint"></div>
  </div>
</section>

<section id="tab-settings" hidden>
  <div class="card">
    <h2 data-i18n="masterTitle"></h2>
    <p class="hint" data-i18n="masterHint"></p>
    <div id="env-warning"></div>
    <div class="row">
      <div>
        <label for="f-consultant" data-i18n="consultant"></label>
        <input id="f-consultant" type="number" min="1001" max="9999999" placeholder="z. B. 29098">
        <div class="field-hint" data-i18n="consultantHint"></div>
        <div class="field-error" data-err="datev.consultantNumber"></div>
      </div>
      <div>
        <label for="f-client" data-i18n="client"></label>
        <input id="f-client" type="number" min="1" max="99999" placeholder="z. B. 55003">
        <div class="field-hint" data-i18n="clientHint"></div>
        <div class="field-error" data-err="datev.clientNumber"></div>
      </div>
    </div>
    <div class="row">
      <div>
        <label for="f-skr" data-i18n="skr"></label>
        <select id="f-skr"><option value="SKR03">SKR03</option><option value="SKR04">SKR04</option></select>
        <div class="field-hint" data-i18n="skrHint"></div>
      </div>
      <div>
        <label for="f-fy" data-i18n="fiscalYear"></label>
        <select id="f-fy"></select>
        <div class="field-hint" data-i18n="fiscalYearHint"></div>
      </div>
    </div>
    <div class="row">
      <div>
        <label for="f-money" data-i18n="moneyAccount"></label>
        <input id="f-money" type="text" inputmode="numeric" pattern="[0-9]*">
        <div class="field-hint"><span data-i18n="moneyAccountHint"></span> <span id="money-default"></span>.</div>
        <div class="field-error" data-err="datev.moneyAccount"></div>
      </div>
      <div>
        <label for="f-tax" data-i18n="defaultTax"></label>
        <select id="f-tax"><option value="19">19 %</option><option value="7">7 %</option><option value="0" data-i18n="taxFree"></option></select>
        <div class="field-hint" data-i18n="defaultTaxHint"></div>
      </div>
    </div>
    <div class="row">
      <div>
        <label for="f-cash" data-i18n="cashAccount"></label>
        <input id="f-cash" type="text" inputmode="numeric" pattern="[0-9]*">
        <div class="field-hint"><span data-i18n="cashAccountHint"></span> <span id="cash-default"></span>.</div>
        <div class="field-error" data-err="datev.cashAccount"></div>
      </div>
      <div>
        <label for="f-card" data-i18n="cardAccount"></label>
        <input id="f-card" type="text" inputmode="numeric" pattern="[0-9]*">
        <div class="field-hint" data-i18n="cardAccountHint"></div>
        <div class="field-error" data-err="datev.cardAccount"></div>
      </div>
    </div>
    <label style="display:flex;align-items:center;gap:.5rem;margin-top:1rem">
      <input id="f-lock" type="checkbox"> <span data-i18n="lockBookings"></span>
    </label>
    <div class="field-hint" data-i18n="lockBookingsHint"></div>
    <label for="f-tag" data-i18n="receiptTag"></label>
    <input id="f-tag" type="text" placeholder="receipt">
    <div class="field-hint" data-i18n="receiptTagHint"></div>
    <div class="field-error" data-err="receiptTag"></div>
  </div>

  <div class="card">
    <h2><span data-i18n="accountsTitle"></span> <span style="font-weight:400;color:var(--muted)" data-i18n="optional"></span></h2>
    <p class="hint" data-i18n="accountsHint"></p>
    <table><thead><tr><th data-i18n="thCategory"></th><th data-i18n="thSuggestion"></th><th data-i18n="thOwnAccount"></th></tr></thead>
    <tbody id="account-rows"></tbody></table>
  </div>

  <div id="settings-banner"></div>
  <button class="primary" id="settings-save" data-i18n="save"></button>
</section>

<section id="tab-export" hidden>
  <div class="card">
    <h2 data-i18n="step1"></h2>
    <div class="row">
      <div><label for="f-month" data-i18n="month"></label><input id="f-month" type="month"></div>
      <div><label for="f-from" data-i18n="from"></label><input id="f-from" type="date"></div>
      <div><label for="f-to" data-i18n="to"></label><input id="f-to" type="date"></div>
    </div>
    <button class="primary" id="btn-load" data-i18n="loadReceipts"></button>
    <div id="load-result" class="hint" style="margin-top:.8rem"></div>
  </div>

  <div class="card" id="analyze-card" hidden>
    <h2 data-i18n="step2"></h2>
    <p class="hint" id="analyze-hint"></p>
    <div class="progress" id="analyze-progress" hidden><div></div></div>
    <div id="analyze-status" class="hint"></div>
    <button class="primary" id="btn-analyze"></button>
  </div>

  <div class="card" id="preview-card" hidden>
    <h2 data-i18n="step3"></h2>
    <p class="hint" data-i18n="previewHint"></p>
    <div id="preview-table"></div>
    <div id="preview-skips"></div>
    <button class="primary" id="btn-export" data-i18n="createFile"></button>
    <div id="export-result"></div>
    <p class="hint" style="margin-top:1rem" data-i18n="importHint"></p>
  </div>

  <div class="card" id="match-card" hidden>
    <h2 data-i18n="step4"></h2>
    <p class="hint" data-i18n="matchHint"></p>
    <input type="file" id="f-bankcsv" accept=".csv,text/csv">
    <button class="primary" id="btn-match" data-i18n="runMatch"></button>
    <div id="match-result"></div>
  </div>
</section>

</main>
<script>
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const AUTH_STORAGE_KEY = "pcx-webui-auth";
let authToken = localStorage.getItem(AUTH_STORAGE_KEY) || "";
let suggestions = {};
let currentDocs = [];

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
const I18N = {
  de: {
    subtitle: "Einstellungen & DATEV-Export",
    tabDoctor: "Systemcheck", tabSettings: "DATEV-Einstellungen", tabExport: "Belege exportieren",
    doctorTitle: "Läuft alles?",
    doctorHint: "Prüft Paperless-ngx, Ollama, die Modelle und die DATEV-Konfiguration. Verbindungsdaten (URLs, Zugangsdaten) werden in der .env-Datei gepflegt.",
    checking: "Prüfe …", recheck: "Erneut prüfen", buildIndex: "Suchindex aufbauen",
    indexStatus: "{done} / {total} Dokumente ({indexed} neu, {skipped} übersprungen{errors})",
    indexErrors: ", {n} Fehler", indexFailed: "Indexierung fehlgeschlagen: ", starting: "Starte …",
    masterTitle: "DATEV-Stammdaten",
    masterHint: "Diese Angaben stehen auf jeder Rechnung eures Steuerberaters, oder ihr fragt einmal kurz nach. Ohne sie wird keine Datei erzeugt.",
    consultant: "Beraternummer", consultantHint: "Die DATEV-Nummer eures Steuerberaters (1001–9999999).",
    client: "Mandantennummer", clientHint: "Eure Nummer beim Steuerberater (1–99999).",
    skr: "Kontenrahmen", skrHint: "Steht im Zweifel auf der BWA — oder den Steuerberater fragen.",
    fiscalYear: "Beginn des Wirtschaftsjahres", fiscalYearHint: "Fast immer Januar; abweichend nur, wenn es der Steuerberater sagt.",
    moneyAccount: "Geldkonto (Gegenkonto)", moneyAccountHint: "Konto für Überweisungen/Lastschriften. Standard:",
    defaultTax: "Standard-Steuersatz", taxFree: "0 % (steuerfrei)",
    defaultTaxHint: "Wird nur angenommen, wenn auf dem Beleg kein Steuersatz erkennbar ist — immer mit Warnung.",
    cashAccount: "Kassenkonto (Barzahlung)", cashAccountHint: "Bar bezahlte Belege buchen gegen die Kasse. Standard:",
    cardAccount: "Konto für Kartenzahlung", cardAccountHint: "Leer = Geldkonto. Nur setzen, wenn Kartenumsätze über ein eigenes Konto laufen (z. B. Kreditkarten-Verrechnung).",
    lockBookings: "Buchungen festschreiben (GoBD)",
    lockBookingsHint: "Nur aktivieren, wenn euer Steuerberater festgeschriebene Stapel verlangt — festgeschriebene Buchungen sind nicht mehr änderbar.",
    receiptTag: "Paperless-Tag für Belege", receiptTagHint: "Alle Dokumente mit diesem Tag gelten als Belege für den Export.",
    accountsTitle: "Kontenzuordnung", optional: "(optional)",
    accountsHint: "Leer lassen = eingebauter Vorschlag für den gewählten Kontenrahmen. Nur ausfüllen, wenn euer Steuerberater andere Konten nutzt.",
    thCategory: "Kategorie", thSuggestion: "Vorschlag", thOwnAccount: "Eigenes Konto",
    save: "Einstellungen speichern",
    saved: "Gespeichert. Der Systemcheck zeigt jetzt Grün für DATEV.",
    fixFields: "Bitte die markierten Felder korrigieren.",
    envWarning: "Achtung: {keys} ist per Umgebungsvariable gesetzt und überschreibt die Eingaben hier.",
    step1: "1. Zeitraum wählen", month: "Monat", from: "Von", to: "Bis",
    loadReceipts: "Belege laden", loading: "Lade …",
    loaded: "<b>{n}</b> Beleg(e) mit Tag „{tag}“ im Zeitraum.",
    step2: "2. Belege analysieren",
    analyzeOpen: "{n} Beleg(e) sind noch nicht analysiert. Die Analyse läuft lokal über Ollama und dauert einige Sekunden pro Beleg.",
    analyzeDone: "Alle Belege sind bereits analysiert (Zwischenspeicher).",
    analyzeNow: "Jetzt analysieren ({n})", toPreview: "Weiter zur Vorschau",
    analyzeProgress: "{done} / {total} analysiert", analyzeErrors: " — {n} Fehler",
    analyzeFailed: "Analyse fehlgeschlagen: ",
    step3: "3. Prüfen & exportieren",
    previewHint: "Haken entfernen = Beleg wird nicht exportiert. Warnungen sind kein Fehler, aber einen Blick wert.",
    thReceipt: "Beleg", thDate: "Datum", thVendor: "Händler", thAmount: "Betrag", thAccount: "Konto",
    thPayment: "Zahlart", thTax: "USt", thNotes: "Hinweise",
    payCash: "Bar", payCard: "Karte", payBank: "Bank",
    uncached: "{n} Beleg(e) noch nicht analysiert — fehlen im Export.",
    createFile: "DATEV-Datei erstellen", creating: "Erstelle Datei …",
    importHint: "Import beim Steuerberater bzw. in DATEV: Rechnungswesen → Buchungsdaten importieren. Pro Wirtschaftsjahr entsteht eine Datei.",
    downloadExpired: "Download abgelaufen — bitte erneut erstellen.",
    step4: "4. Kontoabgleich (optional)",
    matchHint: "Bank-CSV-Export (Sparkasse, Volksbank, ING, DKB; Semikolon-Spalten) hochladen. PaperCortex zeigt, welcher Beleg einen Kontoumsatz hat und welcher nicht — reine Kontrolle, es wird nichts gebucht.",
    runMatch: "Abgleichen", matchNoFile: "Bitte zuerst eine CSV-Datei wählen.",
    matchSummary: "{matched} von {receipts} Beleg(en) im Kontoauszug gefunden ({txns} Umsätze im CSV, {open} Umsätze ohne Beleg).",
    matchMatched: "Gefundene Umsätze", matchUnmatched: "Belege OHNE Kontoumsatz (bar gezahlt? fehlt im Auszug?):",
    thTransaction: "Kontoumsatz", thConfidence: "Sicherheit",
    langNote: "Hinweis: Buchungswarnungen und der DATEV-Bericht bleiben deutsch — sie richten sich an die deutsche Kanzlei.",
    authPrompt: "Zugangscode für die PaperCortex-Oberfläche:", noAuth: "Kein Zugangscode",
  },
  en: {
    subtitle: "Settings & DATEV export",
    tabDoctor: "System check", tabSettings: "DATEV settings", tabExport: "Export receipts",
    doctorTitle: "Is everything running?",
    doctorHint: "Checks Paperless-ngx, Ollama, the models, and the DATEV configuration. Connection settings (URLs, credentials) live in the .env file.",
    checking: "Checking …", recheck: "Check again", buildIndex: "Build search index",
    indexStatus: "{done} / {total} documents ({indexed} new, {skipped} skipped{errors})",
    indexErrors: ", {n} errors", indexFailed: "Indexing failed: ", starting: "Starting …",
    masterTitle: "DATEV master data",
    masterHint: "These values are printed on every invoice from your German tax advisor — or ask them once. Nothing is exported without them.",
    consultant: "Consultant number (Beraternummer)", consultantHint: "Your tax advisor's DATEV number (1001–9999999).",
    client: "Client number (Mandantennummer)", clientHint: "Your number at the tax advisor (1–99999).",
    skr: "Chart of accounts", skrHint: "SKR03 or SKR04 — when in doubt, ask the tax advisor.",
    fiscalYear: "Fiscal year starts in", fiscalYearHint: "Almost always January.",
    moneyAccount: "Money account (offset)", moneyAccountHint: "Account for bank transfers/direct debits. Default:",
    defaultTax: "Default VAT rate", taxFree: "0 % (tax-free)",
    defaultTaxHint: "Only assumed when the receipt shows no VAT rate — always flagged with a warning.",
    cashAccount: "Cash account", cashAccountHint: "Receipts paid in cash book against the cash box. Default:",
    cardAccount: "Card payment account", cardAccountHint: "Empty = money account. Set only if card payments settle via a separate account.",
    lockBookings: "Lock bookings (Festschreibung, GoBD)",
    lockBookingsHint: "Enable only if your tax advisor requires locked batches — locked bookings cannot be changed anymore.",
    receiptTag: "Paperless tag for receipts", receiptTagHint: "Every document carrying this tag counts as a receipt for export.",
    accountsTitle: "Account mapping", optional: "(optional)",
    accountsHint: "Leave empty for the built-in suggestion of the selected chart. Fill in only if your tax advisor uses different accounts.",
    thCategory: "Category", thSuggestion: "Suggestion", thOwnAccount: "Own account",
    save: "Save settings",
    saved: "Saved. The system check now shows green for DATEV.",
    fixFields: "Please correct the highlighted fields.",
    envWarning: "Warning: {keys} is set via environment variable and overrides the values here.",
    step1: "1. Pick a period", month: "Month", from: "From", to: "To",
    loadReceipts: "Load receipts", loading: "Loading …",
    loaded: "<b>{n}</b> receipt(s) tagged “{tag}” in this period.",
    step2: "2. Analyze receipts",
    analyzeOpen: "{n} receipt(s) not analyzed yet. Analysis runs locally via Ollama and takes a few seconds per receipt.",
    analyzeDone: "All receipts already analyzed (cache).",
    analyzeNow: "Analyze now ({n})", toPreview: "Continue to preview",
    analyzeProgress: "{done} / {total} analyzed", analyzeErrors: " — {n} errors",
    analyzeFailed: "Analysis failed: ",
    step3: "3. Review & export",
    previewHint: "Untick a receipt to exclude it. Warnings are not errors, but worth a look.",
    thReceipt: "Receipt", thDate: "Date", thVendor: "Vendor", thAmount: "Amount", thAccount: "Account",
    thPayment: "Paid by", thTax: "VAT", thNotes: "Notes",
    payCash: "Cash", payCard: "Card", payBank: "Bank",
    uncached: "{n} receipt(s) not analyzed yet — missing from the export.",
    createFile: "Create DATEV file", creating: "Creating file …",
    importHint: "Import at the tax advisor / in DATEV: Rechnungswesen → import posting data. One file per fiscal year.",
    downloadExpired: "Download expired — please create the file again.",
    step4: "4. Bank reconciliation (optional)",
    matchHint: "Upload a bank CSV export (Sparkasse, Volksbank, ING, DKB; semicolon columns). PaperCortex shows which receipt has a bank transaction and which has none — read-only, nothing gets booked.",
    runMatch: "Reconcile", matchNoFile: "Please choose a CSV file first.",
    matchSummary: "{matched} of {receipts} receipt(s) found in the bank statement ({txns} transactions in the CSV, {open} without a receipt).",
    matchMatched: "Matched transactions", matchUnmatched: "Receipts WITHOUT a bank transaction (paid cash? missing from the export?):",
    thTransaction: "Bank transaction", thConfidence: "Confidence",
    langNote: "Note: booking warnings and the DATEV report stay German — they address the German tax advisor.",
    authPrompt: "Access code for the PaperCortex UI:", noAuth: "No access code",
  },
};
const DOCTOR_LABELS = {
  en: {
    paperless: "Paperless-ngx reachable", "receipt-tag": "Receipt tag",
    ollama: "Ollama reachable", "ollama-model": "Analysis model",
    "ollama-embedding": "Embedding model", "ollama-vision": "Vision model (photo receipts)",
    vectors: "Search index", datev: "DATEV configuration",
  },
};
let lang = localStorage.getItem("pcx-lang") || ((navigator.language || "de").toLowerCase().startsWith("de") ? "de" : "en");
if (!I18N[lang]) lang = "en";
function t(key, vars) {
  let text = (I18N[lang] && I18N[lang][key]) || I18N.de[key] || key;
  Object.entries(vars || {}).forEach(([k, v]) => { text = text.split("{" + k + "}").join(String(v)); });
  return text;
}
function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("#lang-toggle button").forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
}
document.querySelectorAll("#lang-toggle button").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.lang === lang) return;
    localStorage.setItem("pcx-lang", btn.dataset.lang);
    location.reload();
  });
});

// ---------------------------------------------------------------------------
// API helper (access code stays in the header, never in a URL)
// ---------------------------------------------------------------------------
async function api(path, options) {
  const opts = options || {};
  opts.headers = Object.assign({}, opts.headers, authToken ? { "X-Auth-Token": authToken } : {});
  const res = await fetch(path, opts);
  if (res.status === 401) {
    const entered = prompt(t("authPrompt"));
    if (entered) { authToken = entered; localStorage.setItem(AUTH_STORAGE_KEY, entered); return api(path, options); }
    throw new Error(t("noAuth"));
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !body.errors) throw new Error(body.error || ("HTTP " + res.status));
  return body;
}

async function startDownload(name) {
  const data = await api("/api/file/ticket", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const params = new URLSearchParams();
  params.set("ticket", data.ticket);
  window.location.href = "/api/file?" + params.toString();
}

// --- Tabs ---
document.querySelectorAll("nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b === btn));
    ["doctor", "settings", "export"].forEach((tab) => { $("tab-" + tab).hidden = tab !== btn.dataset.tab; });
  });
});

// ---------------------------------------------------------------------------
// System check + index job
// ---------------------------------------------------------------------------
function doctorLabel(check) {
  return (DOCTOR_LABELS[lang] && DOCTOR_LABELS[lang][check.id]) || check.label;
}
async function loadDoctor() {
  $("doctor-list").innerHTML = '<li><span class="check-detail">' + esc(t("checking")) + "</span></li>";
  try {
    const data = await api("/api/doctor");
    $("doctor-list").innerHTML = data.checks.map((c) =>
      '<li><span class="dot ' + c.status + '"></span><span class="check-label">' + esc(doctorLabel(c)) +
      '</span><span class="check-detail">' + esc(c.detail) + "</span></li>").join("");
  } catch (e) {
    $("doctor-list").innerHTML = '<li><span class="dot fail"></span><span class="check-detail">' + esc(e.message) + "</span></li>";
  }
}
$("doctor-rerun").addEventListener("click", loadDoctor);

async function pollIndexJob() {
  const status = await api("/api/index-job");
  const bar = $("index-progress");
  bar.hidden = false;
  bar.firstElementChild.style.width = status.total ? Math.round((status.done / status.total) * 100) + "%" : "0";
  $("index-status").textContent = t("indexStatus", {
    done: status.done, total: status.total, indexed: status.indexed, skipped: status.skipped,
    errors: status.errors.length ? t("indexErrors", { n: status.errors.length }) : "",
  });
  if (status.state === "running") return setTimeout(pollIndexJob, 2000);
  bar.hidden = true;
  $("btn-index").disabled = false;
  if (status.state === "failed") {
    $("index-status").textContent = t("indexFailed") + (status.message || "");
    return;
  }
  loadDoctor();
}
$("btn-index").addEventListener("click", async () => {
  $("btn-index").disabled = true;
  $("index-status").textContent = t("starting");
  try {
    await api("/api/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    pollIndexJob();
  } catch (e) {
    $("btn-index").disabled = false;
    $("index-status").textContent = e.message;
  }
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const MONTHS = {
  de: ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"],
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
};
(MONTHS[lang] || MONTHS.de).forEach((m, i) => { $("f-fy").insertAdjacentHTML("beforeend", '<option value="' + (i + 1) + '">' + m + "</option>"); });

const CATEGORY_LABELS = {
  de: {
    office_supplies: "Bürobedarf", travel: "Reisekosten", food: "Bewirtung/Verpflegung",
    telephone: "Telefon/Internet", postage: "Porto", insurance: "Versicherungen",
    rent: "Miete", advertising: "Werbung", software: "Software", hardware: "Hardware/Geräte",
    consulting: "Beratung", training: "Fortbildung", vehicle: "Fahrzeug",
  },
  en: {
    office_supplies: "Office supplies", travel: "Travel", food: "Meals/catering",
    telephone: "Phone/internet", postage: "Postage", insurance: "Insurance",
    rent: "Rent", advertising: "Advertising", software: "Software", hardware: "Hardware",
    consulting: "Consulting", training: "Training", vehicle: "Vehicle",
  },
};

function moneyDefault() { return $("f-skr").value === "SKR04" ? "1800" : "1200"; }
function cashDefault() { return $("f-skr").value === "SKR04" ? "1600" : "1000"; }
function refreshSkrHints() {
  $("money-default").textContent = moneyDefault();
  $("f-money").placeholder = moneyDefault();
  $("cash-default").textContent = cashDefault();
  $("f-cash").placeholder = cashDefault();
  $("f-card").placeholder = $("f-money").value.trim() || moneyDefault();
  const key = $("f-skr").value === "SKR04" ? "skr04" : "skr03";
  document.querySelectorAll("#account-rows tr").forEach((tr) => {
    const cat = tr.dataset.cat;
    tr.querySelector(".suggestion").textContent = suggestions[cat] ? suggestions[cat][key] : "";
    tr.querySelector("input").placeholder = suggestions[cat] ? suggestions[cat][key] : "";
  });
}
$("f-skr").addEventListener("change", refreshSkrHints);

async function loadSettings() {
  const data = await api("/api/settings");
  suggestions = data.accountSuggestions || {};
  const labels = CATEGORY_LABELS[lang] || CATEGORY_LABELS.de;
  $("account-rows").innerHTML = Object.keys(suggestions).map((cat) =>
    '<tr data-cat="' + esc(cat) + '"><td>' + esc(labels[cat] || cat) +
    '</td><td class="suggestion"></td><td><input type="text" inputmode="numeric" style="max-width:8rem" data-cat-input="' + esc(cat) + '"></td></tr>').join("");
  const d = data.datev || {};
  if (d.consultantNumber) $("f-consultant").value = d.consultantNumber;
  if (d.clientNumber) $("f-client").value = d.clientNumber;
  $("f-skr").value = d.skr || "SKR03";
  $("f-fy").value = String(d.fiscalYearStartMonth || 1);
  $("f-money").value = d.moneyAccount || "";
  $("f-cash").value = d.cashAccount || "";
  $("f-card").value = d.cardAccount || "";
  $("f-lock").checked = d.lockBookings === true;
  $("f-tax").value = String(d.defaultTaxRate ?? 19);
  $("f-tag").value = data.receiptTag || "receipt";
  Object.entries(d.accountOverrides || {}).forEach(([cat, acct]) => {
    const input = document.querySelector('[data-cat-input="' + cat + '"]');
    if (input) input.value = acct;
  });
  refreshSkrHints();
  if (data.envOverrides && data.envOverrides.length) {
    $("env-warning").innerHTML = '<div class="banner err">' + esc(t("envWarning", { keys: data.envOverrides.join(", ") })) + "</div>";
  }
}

$("settings-save").addEventListener("click", async () => {
  document.querySelectorAll(".field-error").forEach((el) => { el.textContent = ""; });
  $("settings-banner").innerHTML = "";
  const overrides = {};
  document.querySelectorAll("[data-cat-input]").forEach((input) => {
    if (input.value.trim()) overrides[input.dataset.catInput] = input.value.trim();
  });
  const body = {
    receiptTag: $("f-tag").value.trim() || "receipt",
    datev: {
      consultantNumber: Number($("f-consultant").value),
      clientNumber: Number($("f-client").value),
      skr: $("f-skr").value,
      fiscalYearStartMonth: Number($("f-fy").value),
      accountLength: 4,
      defaultTaxRate: Number($("f-tax").value),
      lockBookings: $("f-lock").checked,
      accountOverrides: overrides,
    },
  };
  ["money", "cash", "card"].forEach((kind) => {
    const value = $("f-" + kind).value.trim();
    if (value) body.datev[kind + "Account"] = value;
  });
  const result = await api("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (result.ok) {
    $("settings-banner").innerHTML = '<div class="banner ok">' + esc(t("saved")) + "</div>";
    loadDoctor();
  } else {
    (result.errors || []).forEach((err) => {
      const slot = document.querySelector('[data-err="' + err.field + '"]');
      if (slot) slot.textContent = err.message;
    });
    $("settings-banner").innerHTML = '<div class="banner err">' + esc(t("fixFields")) + "</div>";
  }
});

// ---------------------------------------------------------------------------
// Export flow
// ---------------------------------------------------------------------------
function setRangeFromMonth() {
  const value = $("f-month").value;
  if (!value) return;
  const [y, m] = value.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  $("f-from").value = value + "-01";
  $("f-to").value = value + "-" + String(last).padStart(2, "0");
}
$("f-month").addEventListener("change", setRangeFromMonth);
(function initMonth() {
  const now = new Date(); now.setMonth(now.getMonth() - 1);
  $("f-month").value = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  setRangeFromMonth();
})();

$("btn-load").addEventListener("click", async () => {
  $("load-result").textContent = t("loading");
  $("analyze-card").hidden = true; $("preview-card").hidden = true; $("match-card").hidden = true;
  try {
    const data = await api("/api/documents?from=" + $("f-from").value + "&to=" + $("f-to").value);
    currentDocs = data.documents;
    const open = data.uncachedIds.length;
    $("load-result").innerHTML = t("loaded", { n: data.documents.length, tag: esc(data.receiptTag) });
    if (data.documents.length === 0) return;
    $("analyze-card").hidden = false;
    $("analyze-hint").textContent = open > 0 ? t("analyzeOpen", { n: open }) : t("analyzeDone");
    $("btn-analyze").textContent = open > 0 ? t("analyzeNow", { n: open }) : t("toPreview");
    $("analyze-status").textContent = "";
  } catch (e) { $("load-result").innerHTML = '<span class="skip-note">' + esc(e.message) + "</span>"; }
});

async function pollJob() {
  const status = await api("/api/job");
  const bar = $("analyze-progress");
  bar.hidden = false;
  bar.firstElementChild.style.width = status.total ? Math.round((status.done / status.total) * 100) + "%" : "0";
  $("analyze-status").textContent = t("analyzeProgress", { done: status.done, total: status.total }) +
    (status.errors.length ? t("analyzeErrors", { n: status.errors.length }) : "");
  if (status.state === "running") return setTimeout(pollJob, 1500);
  if (status.state === "failed") { $("analyze-status").textContent = t("analyzeFailed") + (status.message || ""); return; }
  bar.hidden = true;
  await showPreview();
}

$("btn-analyze").addEventListener("click", async () => {
  const uncached = currentDocs.filter((d) => !d.cached).map((d) => d.id);
  if (uncached.length === 0) return showPreview();
  $("btn-analyze").disabled = true;
  await api("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentIds: uncached }) });
  pollJob();
});

const PAY_LABEL = { cash: "payCash", card: "payCard", bank: "payBank" };
async function showPreview() {
  $("btn-analyze").disabled = false;
  const data = await api("/api/preview?from=" + $("f-from").value + "&to=" + $("f-to").value);
  $("preview-card").hidden = false;
  $("match-card").hidden = false;
  const rows = data.bookings.map((b) =>
    '<tr><td><input type="checkbox" checked data-doc="' + b.documentId + '"></td>' +
    "<td>#" + b.documentId + "</td><td>" + esc(b.date) + "</td><td>" + esc(b.vendor) + "</td>" +
    '<td class="num">' + b.amount.toFixed(2).replace(".", ",") + " €</td>" +
    "<td>" + esc(b.account) + '</td><td><span class="chip">' + esc(t(PAY_LABEL[b.paymentKind] || "payBank")) + " → " + esc(b.offsetAccount) + "</span></td>" +
    "<td>" + b.taxRate + " %</td>" +
    "<td>" + b.warnings.map((w) => '<div class="warn-note">⚠ ' + esc(w) + "</div>").join("") + "</td></tr>").join("");
  $("preview-table").innerHTML =
    '<table><thead><tr><th></th><th>' + esc(t("thReceipt")) + "</th><th>" + esc(t("thDate")) + "</th><th>" + esc(t("thVendor")) +
    '</th><th class="num">' + esc(t("thAmount")) + "</th><th>" + esc(t("thAccount")) + "</th><th>" + esc(t("thPayment")) +
    "</th><th>" + esc(t("thTax")) + "</th><th>" + esc(t("thNotes")) + "</th></tr></thead><tbody>" + rows + "</tbody></table>" +
    (lang === "en" ? '<p class="hint">' + esc(t("langNote")) + "</p>" : "");
  const notes = [];
  if (data.uncachedIds.length) notes.push('<div class="skip-note">' + esc(t("uncached", { n: data.uncachedIds.length })) + "</div>");
  data.skipped.forEach((s) => notes.push('<div class="skip-note">✗ #' + s.documentId + ": " + esc(s.reason) + "</div>"));
  $("preview-skips").innerHTML = notes.join("");
  $("export-result").innerHTML = "";
}

$("btn-export").addEventListener("click", async () => {
  const excludeIds = Array.from(document.querySelectorAll("[data-doc]"))
    .filter((cb) => !cb.checked).map((cb) => Number(cb.dataset.doc));
  $("export-result").innerHTML = '<p class="hint">' + esc(t("creating")) + "</p>";
  try {
    const data = await api("/api/export", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: $("f-from").value, to: $("f-to").value, excludeIds }),
    });
    const links = data.files.map((f) =>
      '<a class="download" href="#" data-file="' + esc(f.name) + '">⬇ ' + esc(f.name) + "</a>").join("");
    $("export-result").innerHTML = links + '<pre class="report">' + esc(data.report) + "</pre>";
  } catch (e) { $("export-result").innerHTML = '<div class="banner err">' + esc(e.message) + "</div>"; }
});

$("export-result").addEventListener("click", (event) => {
  const link = event.target.closest("[data-file]");
  if (!link) return;
  event.preventDefault();
  startDownload(link.dataset.file).catch((e) => {
    $("export-result").insertAdjacentHTML("beforeend", '<div class="banner err">' + esc(e.message) + "</div>");
  });
});

// ---------------------------------------------------------------------------
// Bank reconciliation
// ---------------------------------------------------------------------------
$("btn-match").addEventListener("click", async () => {
  const file = $("f-bankcsv").files[0];
  if (!file) { $("match-result").innerHTML = '<div class="banner err">' + esc(t("matchNoFile")) + "</div>"; return; }
  const csv = await file.text();
  $("match-result").innerHTML = '<p class="hint">' + esc(t("loading")) + "</p>";
  try {
    const data = await api("/api/match", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: $("f-from").value, to: $("f-to").value, csv }),
    });
    let h = '<div class="banner ok">' + esc(t("matchSummary", {
      matched: data.matched.length, receipts: data.receiptCount,
      txns: data.transactionCount, open: data.unmatchedTransactionCount,
    })) + "</div>";
    if (data.matched.length) {
      h += "<table><thead><tr><th>" + esc(t("thReceipt")) + "</th><th>" + esc(t("thVendor")) +
        '</th><th class="num">' + esc(t("thAmount")) + "</th><th>" + esc(t("thTransaction")) +
        "</th><th>" + esc(t("thConfidence")) + "</th></tr></thead><tbody>";
      data.matched.forEach((m) => {
        h += "<tr><td>#" + m.documentId + "</td><td>" + esc(m.vendor) + '</td><td class="num">' +
          m.amount.toFixed(2).replace(".", ",") + " €</td><td>" + esc(m.txnDate) + " · " + esc(m.txnDescription) +
          '</td><td class="num">' + Math.round(m.confidence * 100) + " %</td></tr>";
      });
      h += "</tbody></table>";
    }
    if (data.unmatchedReceipts.length) {
      h += '<p class="skip-note" style="margin-top:.8rem">' + esc(t("matchUnmatched")) + "</p>";
      data.unmatchedReceipts.forEach((r) => {
        h += '<div class="skip-note">✗ #' + r.documentId + " " + esc(r.vendor) + " · " + esc(r.date) + " · " +
          r.amount.toFixed(2).replace(".", ",") + " €</div>";
      });
    }
    $("match-result").innerHTML = h;
  } catch (e) { $("match-result").innerHTML = '<div class="banner err">' + esc(e.message) + "</div>"; }
});

// --- Start ---
applyI18n();
loadDoctor();
loadSettings().catch((e) => { $("settings-banner").innerHTML = '<div class="banner err">' + esc(e.message) + "</div>"; });
</script>
</body>
</html>
`;
