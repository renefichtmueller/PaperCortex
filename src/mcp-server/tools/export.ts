/**
 * DATEV/CSV export tool for the PaperCortex MCP Server.
 *
 * DATEV mode writes real EXTF files (Buchungsstapel format version 13,
 * CP1252) to the export directory and reports exactly which receipts
 * were skipped and why. Configuration problems come back as instructions
 * ("run npm run datev:init"), not stack traces. CSV mode stays inline
 * for quick spreadsheet use.
 */

import * as fs from "fs";
import * as path from "path";

import { loadStoredConfig, resolveDatevConfig } from "../../datev/config.js";
import { formatRunReport, runDatevExport } from "../../datev/export-run.js";
import { createReceiptCache } from "../../datev/receipt-cache.js";
import { createDatevService } from "../../datev/service.js";
import type { ToolContext } from "../index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportArgs {
  readonly documentIds: readonly number[];
  readonly format?: "datev" | "csv";
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

const text = (value: string): ToolResult => ({
  content: [{ type: "text", text: value }],
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handle a `papercortex_export` tool call.
 */
export async function handleExport(
  ctx: ToolContext,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const { documentIds, format = "datev" } = args as unknown as ExportArgs;

  if (!documentIds || documentIds.length === 0) {
    return text("Error: at least one document ID is required for export.");
  }

  const dataDir = process.env["PAPERCORTEX_DATA_DIR"] ?? "./data";
  fs.mkdirSync(dataDir, { recursive: true });
  const cache = createReceiptCache(path.join(dataDir, "receipts.db"));
  try {
    const service = createDatevService({
      paperless: ctx.paperless,
      ollama: ctx.ollama,
      cache,
    });
    const { receipts, failures } = await service.collectReceipts(documentIds);

    if (format === "datev") {
      const config = resolveDatevConfig(loadStoredConfig());
      if (config === null) {
        return text(
          "DATEV ist noch nicht eingerichtet. / DATEV is not configured yet.\n" +
            'Im PaperCortex-Verzeichnis einmalig ausfuehren / run once:\n' +
            "  npm run datev:init",
        );
      }
      const result = runDatevExport(receipts, config);

      const exportDir = process.env["PAPERCORTEX_EXPORT_DIR"] ?? "./exports";
      fs.mkdirSync(exportDir, { recursive: true });
      const paths: string[] = [];
      for (const batch of result.batches) {
        const target = path.resolve(exportDir, batch.filename);
        fs.writeFileSync(target, batch.file);
        paths.push(target);
      }

      const failureLines = failures.map(
        (f) => `  ✗ Beleg #${f.documentId}: Extraktion fehlgeschlagen (${f.error})`,
      );
      const report = [
        formatRunReport(result),
        ...failureLines,
        ...(paths.length > 0
          ? [
              "",
              "Geschriebene Datei(en):",
              ...paths.map((p) => `  ${p}`),
              "",
              "Import in DATEV: Bestand -> Importieren -> DATEV-Format. Details: docs/datev.md",
            ]
          : []),
      ].join("\n");
      return text(report);
    }

    const header =
      "Document ID;Vendor;Date;Amount;Tax Rate;Currency;Category";
    const rows = receipts.map(
      (r) =>
        `${r.documentId};${r.vendor};${r.date};${r.totalAmount.toFixed(2)};` +
        `${r.taxRate ?? ""};${r.currency ?? "EUR"};${r.category ?? ""}`,
    );
    const csv = [header, ...rows].join("\n");
    return text(
      `CSV export for ${receipts.length} receipt(s):\n\n\`\`\`csv\n${csv}\n\`\`\``,
    );
  } finally {
    cache.close();
  }
}
