# Tasks

## 2026-09-24: Idiot-proof DATEV export (DONE)

**Why:** A user report showed the DATEV feature was unusable: the exporter
ignored the configured consultant/client numbers, wrote no EXTF header (DATEV
refuses such files), used a simplified column layout, emitted UTF-8 instead of
CP1252, silently booked unknown tax rates as 19%, and the documented CLI
command did not exist.

**What shipped:**
- `src/datev/` core: `format.ts` (EXTF header v700, Buchungsstapel format
  version 13 with all 125 columns, CP1252 encoding), `config.ts` (zod-validated
  settings stored in `data/config.json`, `DATEV_*` env overrides), `accounts.ts`
  (SKR03/SKR04 with per-category overrides), `exporter.ts` (strict batch
  builder with visible warnings), `export-run.ts` (skip-and-report per broken
  receipt, automatic one-file-per-fiscal-year split), `receipt-cache.ts`
  (SQLite cache so re-runs are instant), `service.ts` (tag+date selection,
  cache-first extraction).
- `src/cli/datev.ts`: `npm run datev:init` (interactive wizard, validates every
  answer, works with piped input), `datev:check` (dry run with full report),
  `datev:export`.
- MCP tool `papercortex_export` writes real files and reports skips; missing
  configuration returns instructions instead of exporting garbage.
- `docs/datev.md` step-by-step guide (German, English summary), README and
  docs updated, `eslint.config.js` added (lint previously crashed on every
  machine: ESLint 9 without any config).

**Evidence:** 40/40 vitest, `tsc --noEmit` clean, lint green, build green,
wizard smoke-tested (piped answers + EOF abort), unconfigured `datev:check`
prints the init pointer.

**Open:** none for this feature. GitHub issues #1 (compose restart loop) and
#2 (initial vector store population) remain separate onboarding tasks.

## 2026-09-24: Web UI settings page for DATEV (DONE)

**Why:** Rene: the DATEV setup must be idiot-proof for Docker/UnRaid users --
"eventuell langt eine Einstellungsseite". The CLI wizard covers terminal
users; the target audience lives in browser UIs.

**What shipped:**
- `src/webui/`: `api.ts` (settings round-trip, system check, preview,
  export -- dependency-injected and unit-tested), `jobs.ts` (background
  extraction with progress polling), `server.ts` (routing, optional
  WEBUI_TOKEN auth, CSP, strict export-filename validation), `page.ts`
  (self-contained German single-page UI: Systemcheck / DATEV-Einstellungen /
  Belege exportieren), `start.ts` + `main.ts` (embedded in the MCP server
  process by default, standalone via `npm run webui`).
- System check with actionable diagnostics ("ollama pull <model>",
  "PAPERLESS_URL prüfen"); settings validated field-by-field with German
  error messages; export flow: load -> analyze (progress bar) -> preview
  with warnings and per-receipt opt-out -> CP1252 EXTF download.
- Robustness found by smoke test: better-sqlite3 dies on a fresh checkout
  because ./data does not exist -- vector store and receipt cache now create
  their directory (very likely the mechanism behind GitHub issue #1).
- docker-compose port 8140 (Erik compose: 127.0.0.1:8141), Dockerfile
  EXPOSE, .env.example WEBUI_* block, docs/datev.md + README sections.

**Evidence:** 51/51 vitest (16 new webui tests incl. path-traversal guard on
downloads), tsc, lint, build green; UI verified in the browser end-to-end
(doctor renders, invalid Beraternummer rejected with field error, valid save
persists config.json, banner confirms).

**Coordination:** built on top of the consolidated src/datev core from the
parallel session (see entry above); no core files changed except the mkdir
robustness fix. Push to GitHub and the Erik deploy remain gated on Rene's
approval.

## 2026-09-24: Web UI security hardening (DONE)

**Why:** Automated security review on the web UI commit: access code leaked
into download URLs, port open to the LAN by default without a code, no
DNS-rebinding defense, fail-open when no code is set.

**What shipped:**
- Download tickets (`src/webui/tickets.ts`): single-use, 60s TTL, bounded;
  the access code lives only in the X-Auth-Token header and never in a URL.
- Host-header allowlist (localhost by default, `WEBUI_ALLOWED_HOSTS` for
  LAN names/IPs) as the DNS-rebinding defense; 403 carries the exact fix.
- Constant-time access-code comparison; loud startup warning when no code
  is configured.
- Shipped compose now binds 127.0.0.1:8140 with a documented LAN variant;
  docs and .env.example explain the tradeoff.

**Evidence:** 59/59 vitest incl. real-HTTP server tests (foreign Host
rejected with hint, 401 paths, ticket single-use and replay refusal,
path-traversal ticket refusal), tsc, lint, build green.

## 2026-09-24: Extraction robustness, sanity checks, index builder (DONE)

**Why:** Rene: "dann verbessere bitte" on the prioritized improvement list.
The extractor did a bare JSON.parse on LLM output (breaks on markdown
fences), amounts were never cross-checked, twice-scanned receipts booked
twice, and NOTHING ever populated the vector store (GitHub issue #2 --
semantic search returned nothing forever).

**What shipped:**
- `src/receipt/extraction-parse.ts`: fence-stripping, string-aware
  balanced-brace JSON extraction, zod-validated result with documented
  per-field defaults (unparseable date stays as-is so the exporter SKIPS
  with the real reason instead of booking "today"); extractor retries once
  with a sterner instruction, then fails with a clear error.
- Exporter sanity checks: net+tax vs gross and tax-amount vs tax-rate
  arithmetic warnings; duplicate detection (vendor+date+amount) flagged in
  the preview so the user unticks the second scan BEFORE export.
- `src/webui/indexer.ts` + "Suchindex aufbauen" button in the system check:
  paginated full index build as a background job with progress, skip
  already-indexed, per-document errors -- closes issue #2.
- `.github/workflows/docker-publish.yml`: multi-arch ghcr.io image on push
  to main and v* tags (activates with the pending push).

**Evidence:** 77/77 vitest (18 new: extraction-parse 6, extractor retry 4,
indexer 3, exporter sanity/duplicates 4, adjusted fakes), tsc, lint, build
green.

**Open:** UnRaid Community-Apps template once the first ghcr image exists;
vision-model extraction and payment-method money accounts remain backlog.

## 2026-09-24: Backlog round -- vision, payment accounts, matching, lock, i18n (DONE)

**Why:** Rene: "dann verbessere bitte" on the parked backlog, plus
"mehrsprachige Unterstuetzung in de und en".

**What shipped:**
- Vision extraction: optional OLLAMA_VISION_MODEL; when OCR is thin
  (<150 chars) or the text path fails, the model reads the receipt image
  (original file for images, rendered thumbnail for PDFs). Doctor checks
  the model when configured. No model set = unchanged behavior.
- Money account per payment kind: cash books against the Kasse
  (1000/1600 default), card optionally against its own account; free-text
  methods normalized (bar/EC/girocard/...). Preview shows Zahlart ->
  Gegenkonto per booking.
- Festschreibung toggle (GoBD): header field 21 and row field 114.
- Bank reconciliation wired up (was dead code): parseBankCsvText for
  uploads, German date normalization DD.MM.YYYY (previously Invalid Date
  made the date signal silently useless), vendor matching on the first
  meaningful word instead of a fixed 8-char prefix ("REWE SAGT DANKE"),
  POST /api/match with 1MB CSV limit, step 4 in the export tab: matched /
  receipts-without-transaction / open transactions. Read-only.
- Bilingual UI (de/en): dictionary-based, toggle persists, doctor labels
  localized. Booking warnings and the DATEV report stay German by design
  (they address the German tax advisor and travel into the export files).

**Evidence:** 87/87 vitest (10 new), tsc, lint, build green; UI smoke in
the browser in both languages incl. the live vision-model doctor check.
