# Time Log

| Date | Agent | Duration | Description | Issue |
|---|---|---|---|---|
| 2026-09-24 | Claude | 75m | Rebuilt the DATEV export end to end: real EXTF/Buchungsstapel v13 format with CP1252 output, validated configuration with setup wizard, dry-run check command, skip-and-report semantics, fiscal-year splitting, SQLite extraction cache, MCP tool on the new core, docs, and a working lint setup. | DATEV usability report |
| 2026-09-24 | Claude | 75m | Built the German web UI on top of the consolidated DATEV core (settings page with field-level validation, system check with actionable diagnostics, analyze job with progress, preview with warnings and opt-out, CP1252 download with strict filename guard), fixed the fresh-install SQLite directory crash, verified the full flow in the browser, and coordinated the two-session collision via cross-session handoff. | DATEV idiot-proof |
| 2026-09-24 | Claude | 55m | Hardened the extraction pipeline (tolerant JSON parsing with retry, zod-validated defaults), added arithmetic sanity checks and duplicate flagging to the export preview, built the search-index background job with UI button that closes issue #2, and prepared the multi-arch ghcr publish workflow. | DATEV idiot-proof |
