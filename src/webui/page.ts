/**
 * The browser page of the PaperCortex web UI, shipped as one self-contained
 * HTML string: no build step, no CDN, works offline in the home lab.
 * German-first, because the DATEV audience is German-speaking.
 */

export const PAGE_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PaperCortex Einstellungen</title>
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
  .progress { height: .55rem; background: var(--line); border-radius: 4px; overflow: hidden; margin: .6rem 0; max-width: 26rem; }
  .progress > div { height: 100%; background: var(--accent); width: 0; transition: width .4s; }
  pre.report { background: #faf7f2; border: 1px solid var(--line); border-radius: 8px; padding: .8rem; font-size: .8rem; overflow-x: auto; white-space: pre-wrap; }
  a.download { display: inline-block; font-weight: 700; color: var(--accent-dark); margin: .3rem .8rem .3rem 0; }
  code { background: #f3efe9; padding: .05rem .3rem; border-radius: 4px; font-size: .85em; }
</style>
</head>
<body>
<header><h1>Paper<b>Cortex</b></h1><span>Einstellungen &amp; DATEV-Export</span></header>
<nav>
  <button data-tab="doctor" class="active">Systemcheck</button>
  <button data-tab="settings">DATEV-Einstellungen</button>
  <button data-tab="export">Belege exportieren</button>
</nav>
<main>

<section id="tab-doctor">
  <div class="card">
    <h2>Läuft alles?</h2>
    <p class="hint">Prüft Paperless-ngx, Ollama, die Modelle und die DATEV-Konfiguration. Verbindungsdaten (URLs, Zugangsdaten) werden in der <code>.env</code>-Datei gepflegt.</p>
    <ul class="checks" id="doctor-list"><li><span class="check-detail">Prüfe …</span></li></ul>
    <button class="ghost" id="doctor-rerun">Erneut prüfen</button>
  </div>
</section>

<section id="tab-settings" hidden>
  <div class="card">
    <h2>DATEV-Stammdaten</h2>
    <p class="hint">Diese Angaben stehen auf jeder Rechnung eures Steuerberaters, oder ihr fragt einmal kurz nach. Ohne sie wird keine Datei erzeugt.</p>
    <div id="env-warning"></div>
    <div class="row">
      <div>
        <label for="f-consultant">Beraternummer</label>
        <input id="f-consultant" type="number" min="1001" max="9999999" placeholder="z. B. 29098">
        <div class="field-hint">Die DATEV-Nummer eures Steuerberaters (1001–9999999).</div>
        <div class="field-error" data-err="datev.consultantNumber"></div>
      </div>
      <div>
        <label for="f-client">Mandantennummer</label>
        <input id="f-client" type="number" min="1" max="99999" placeholder="z. B. 55003">
        <div class="field-hint">Eure Nummer beim Steuerberater (1–99999).</div>
        <div class="field-error" data-err="datev.clientNumber"></div>
      </div>
    </div>
    <div class="row">
      <div>
        <label for="f-skr">Kontenrahmen</label>
        <select id="f-skr"><option value="SKR03">SKR03</option><option value="SKR04">SKR04</option></select>
        <div class="field-hint">Steht im Zweifel auf der BWA — oder den Steuerberater fragen.</div>
      </div>
      <div>
        <label for="f-fy">Beginn des Wirtschaftsjahres</label>
        <select id="f-fy"></select>
        <div class="field-hint">Fast immer Januar; abweichend nur, wenn es der Steuerberater sagt.</div>
      </div>
    </div>
    <div class="row">
      <div>
        <label for="f-money">Geldkonto (Gegenkonto)</label>
        <input id="f-money" type="text" inputmode="numeric" pattern="[0-9]*">
        <div class="field-hint">Das Konto, von dem die Belege bezahlt werden. Standard: <span id="money-default"></span>.</div>
        <div class="field-error" data-err="datev.moneyAccount"></div>
      </div>
      <div>
        <label for="f-tax">Standard-Steuersatz</label>
        <select id="f-tax"><option value="19">19 %</option><option value="7">7 %</option><option value="0">0 % (steuerfrei)</option></select>
        <div class="field-hint">Wird nur angenommen, wenn auf dem Beleg kein Steuersatz erkennbar ist — immer mit Warnung.</div>
      </div>
    </div>
    <label for="f-tag">Paperless-Tag für Belege</label>
    <input id="f-tag" type="text" placeholder="receipt">
    <div class="field-hint">Alle Dokumente mit diesem Tag gelten als Belege für den Export.</div>
    <div class="field-error" data-err="receiptTag"></div>
  </div>

  <div class="card">
    <h2>Kontenzuordnung <span style="font-weight:400;color:var(--muted)">(optional)</span></h2>
    <p class="hint">Leer lassen = eingebauter Vorschlag für den gewählten Kontenrahmen. Nur ausfüllen, wenn euer Steuerberater andere Konten nutzt.</p>
    <table><thead><tr><th>Kategorie</th><th>Vorschlag</th><th>Eigenes Konto</th></tr></thead>
    <tbody id="account-rows"></tbody></table>
  </div>

  <div id="settings-banner"></div>
  <button class="primary" id="settings-save">Einstellungen speichern</button>
</section>

<section id="tab-export" hidden>
  <div class="card">
    <h2>1. Zeitraum wählen</h2>
    <div class="row">
      <div><label for="f-month">Monat</label><input id="f-month" type="month"></div>
      <div><label for="f-from">Von</label><input id="f-from" type="date"></div>
      <div><label for="f-to">Bis</label><input id="f-to" type="date"></div>
    </div>
    <button class="primary" id="btn-load">Belege laden</button>
    <div id="load-result" class="hint" style="margin-top:.8rem"></div>
  </div>

  <div class="card" id="analyze-card" hidden>
    <h2>2. Belege analysieren</h2>
    <p class="hint" id="analyze-hint"></p>
    <div class="progress" id="analyze-progress" hidden><div></div></div>
    <div id="analyze-status" class="hint"></div>
    <button class="primary" id="btn-analyze">Jetzt analysieren</button>
  </div>

  <div class="card" id="preview-card" hidden>
    <h2>3. Prüfen &amp; exportieren</h2>
    <p class="hint">Haken entfernen = Beleg wird nicht exportiert. Warnungen sind kein Fehler, aber einen Blick wert.</p>
    <div id="preview-table"></div>
    <div id="preview-skips"></div>
    <button class="primary" id="btn-export">DATEV-Datei erstellen</button>
    <div id="export-result"></div>
    <p class="hint" style="margin-top:1rem">Import beim Steuerberater bzw. in DATEV: <b>Rechnungswesen → Buchungsdaten importieren</b>. Pro Wirtschaftsjahr entsteht eine Datei.</p>
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

async function api(path, options) {
  const opts = options || {};
  opts.headers = Object.assign({}, opts.headers, authToken ? { "X-Auth-Token": authToken } : {});
  const res = await fetch(path, opts);
  if (res.status === 401) {
    const entered = prompt("Zugangscode für die PaperCortex-Oberfläche:");
    if (entered) { authToken = entered; localStorage.setItem(AUTH_STORAGE_KEY, entered); return api(path, options); }
    throw new Error("Kein Zugangscode");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !body.errors) throw new Error(body.error || ("HTTP " + res.status));
  return body;
}

function downloadHref(name) {
  const params = new URLSearchParams();
  params.set("name", name);
  if (authToken) params.set("token", authToken);
  return "/api/file?" + params.toString();
}

// --- Tabs ---
document.querySelectorAll("nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b === btn));
    ["doctor", "settings", "export"].forEach((t) => { $("tab-" + t).hidden = t !== btn.dataset.tab; });
  });
});

// --- Systemcheck ---
async function loadDoctor() {
  $("doctor-list").innerHTML = '<li><span class="check-detail">Prüfe …</span></li>';
  try {
    const data = await api("/api/doctor");
    $("doctor-list").innerHTML = data.checks.map((c) =>
      '<li><span class="dot ' + c.status + '"></span><span class="check-label">' + esc(c.label) +
      '</span><span class="check-detail">' + esc(c.detail) + "</span></li>").join("");
  } catch (e) {
    $("doctor-list").innerHTML = '<li><span class="dot fail"></span><span class="check-detail">' + esc(e.message) + "</span></li>";
  }
}
$("doctor-rerun").addEventListener("click", loadDoctor);

// --- Einstellungen ---
const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
MONTHS.forEach((m, i) => { $("f-fy").insertAdjacentHTML("beforeend", '<option value="' + (i + 1) + '">' + m + "</option>"); });

function moneyDefault() { return $("f-skr").value === "SKR04" ? "1800" : "1200"; }
function refreshSkrHints() {
  $("money-default").textContent = moneyDefault();
  $("f-money").placeholder = moneyDefault();
  const key = $("f-skr").value === "SKR04" ? "skr04" : "skr03";
  document.querySelectorAll("#account-rows tr").forEach((tr) => {
    const cat = tr.dataset.cat;
    tr.querySelector(".suggestion").textContent = suggestions[cat] ? suggestions[cat][key] : "";
    tr.querySelector("input").placeholder = suggestions[cat] ? suggestions[cat][key] : "";
  });
}
$("f-skr").addEventListener("change", refreshSkrHints);

const CATEGORY_LABELS = {
  office_supplies: "Bürobedarf", travel: "Reisekosten", food: "Bewirtung/Verpflegung",
  telephone: "Telefon/Internet", postage: "Porto", insurance: "Versicherungen",
  rent: "Miete", advertising: "Werbung", software: "Software", hardware: "Hardware/Geräte",
  consulting: "Beratung", training: "Fortbildung", vehicle: "Fahrzeug",
};

async function loadSettings() {
  const data = await api("/api/settings");
  suggestions = data.accountSuggestions || {};
  $("account-rows").innerHTML = Object.keys(suggestions).map((cat) =>
    '<tr data-cat="' + esc(cat) + '"><td>' + esc(CATEGORY_LABELS[cat] || cat) +
    '</td><td class="suggestion"></td><td><input type="text" inputmode="numeric" style="max-width:8rem" data-cat-input="' + esc(cat) + '"></td></tr>').join("");
  const d = data.datev || {};
  if (d.consultantNumber) $("f-consultant").value = d.consultantNumber;
  if (d.clientNumber) $("f-client").value = d.clientNumber;
  $("f-skr").value = d.skr || "SKR03";
  $("f-fy").value = String(d.fiscalYearStartMonth || 1);
  $("f-money").value = d.moneyAccount || "";
  $("f-tax").value = String(d.defaultTaxRate ?? 19);
  $("f-tag").value = data.receiptTag || "receipt";
  Object.entries(d.accountOverrides || {}).forEach(([cat, acct]) => {
    const input = document.querySelector('[data-cat-input="' + cat + '"]');
    if (input) input.value = acct;
  });
  refreshSkrHints();
  if (data.envOverrides && data.envOverrides.length) {
    $("env-warning").innerHTML = '<div class="banner err">Achtung: ' + esc(data.envOverrides.join(", ")) +
      " ist per Umgebungsvariable gesetzt und überschreibt die Eingaben hier.</div>";
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
      accountOverrides: overrides,
    },
  };
  if ($("f-money").value.trim()) body.datev.moneyAccount = $("f-money").value.trim();
  const result = await api("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (result.ok) {
    $("settings-banner").innerHTML = '<div class="banner ok">Gespeichert. Der Systemcheck zeigt jetzt Grün für DATEV.</div>';
    loadDoctor();
  } else {
    (result.errors || []).forEach((err) => {
      const slot = document.querySelector('[data-err="' + err.field + '"]');
      if (slot) slot.textContent = err.message;
    });
    $("settings-banner").innerHTML = '<div class="banner err">Bitte die markierten Felder korrigieren.</div>';
  }
});

// --- Export ---
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
  $("load-result").textContent = "Lade …";
  $("analyze-card").hidden = true; $("preview-card").hidden = true;
  try {
    const data = await api("/api/documents?from=" + $("f-from").value + "&to=" + $("f-to").value);
    currentDocs = data.documents;
    const open = data.uncachedIds.length;
    $("load-result").innerHTML = "<b>" + data.documents.length + "</b> Beleg(e) mit Tag „" + esc(data.receiptTag) + "“ im Zeitraum.";
    if (data.documents.length === 0) return;
    $("analyze-card").hidden = false;
    $("analyze-hint").textContent = open > 0
      ? open + " Beleg(e) sind noch nicht analysiert. Die Analyse läuft lokal über Ollama und dauert einige Sekunden pro Beleg."
      : "Alle Belege sind bereits analysiert (Zwischenspeicher).";
    $("btn-analyze").textContent = open > 0 ? "Jetzt analysieren (" + open + ")" : "Weiter zur Vorschau";
    $("analyze-status").textContent = "";
  } catch (e) { $("load-result").innerHTML = '<span class="skip-note">' + esc(e.message) + "</span>"; }
});

async function pollJob() {
  const status = await api("/api/job");
  const bar = $("analyze-progress");
  bar.hidden = false;
  bar.firstElementChild.style.width = status.total ? Math.round((status.done / status.total) * 100) + "%" : "0";
  $("analyze-status").textContent = status.done + " / " + status.total + " analysiert" +
    (status.errors.length ? " — " + status.errors.length + " Fehler" : "");
  if (status.state === "running") return setTimeout(pollJob, 1500);
  if (status.state === "failed") { $("analyze-status").textContent = "Analyse fehlgeschlagen: " + (status.message || ""); return; }
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

async function showPreview() {
  $("btn-analyze").disabled = false;
  const data = await api("/api/preview?from=" + $("f-from").value + "&to=" + $("f-to").value);
  $("preview-card").hidden = false;
  const rows = data.bookings.map((b) =>
    '<tr><td><input type="checkbox" checked data-doc="' + b.documentId + '"></td>' +
    "<td>#" + b.documentId + "</td><td>" + esc(b.date) + "</td><td>" + esc(b.vendor) + "</td>" +
    '<td class="num">' + b.amount.toFixed(2).replace(".", ",") + " €</td>" +
    "<td>" + esc(b.account) + "</td><td>" + b.taxRate + " %</td>" +
    '<td>' + b.warnings.map((w) => '<div class="warn-note">⚠ ' + esc(w) + "</div>").join("") + "</td></tr>").join("");
  $("preview-table").innerHTML =
    '<table><thead><tr><th></th><th>Beleg</th><th>Datum</th><th>Händler</th><th class="num">Betrag</th><th>Konto</th><th>USt</th><th>Hinweise</th></tr></thead><tbody>' +
    rows + "</tbody></table>";
  const notes = [];
  if (data.uncachedIds.length) notes.push('<div class="skip-note">' + data.uncachedIds.length + " Beleg(e) noch nicht analysiert — fehlen im Export.</div>");
  data.skipped.forEach((s) => notes.push('<div class="skip-note">✗ Beleg #' + s.documentId + ": " + esc(s.reason) + "</div>"));
  $("preview-skips").innerHTML = notes.join("");
  $("export-result").innerHTML = "";
}

$("btn-export").addEventListener("click", async () => {
  const excludeIds = Array.from(document.querySelectorAll("[data-doc]"))
    .filter((cb) => !cb.checked).map((cb) => Number(cb.dataset.doc));
  $("export-result").innerHTML = '<p class="hint">Erstelle Datei …</p>';
  try {
    const data = await api("/api/export", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: $("f-from").value, to: $("f-to").value, excludeIds }),
    });
    const links = data.files.map((f) =>
      '<a class="download" href="' + esc(downloadHref(f.name)) + '" download>⬇ ' + esc(f.name) + "</a>").join("");
    $("export-result").innerHTML = links + '<pre class="report">' + esc(data.report) + "</pre>";
  } catch (e) { $("export-result").innerHTML = '<div class="banner err">' + esc(e.message) + "</div>"; }
});

// --- Start ---
loadDoctor();
loadSettings().catch((e) => { $("settings-banner").innerHTML = '<div class="banner err">' + esc(e.message) + "</div>"; });
</script>
</body>
</html>
`;
