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
