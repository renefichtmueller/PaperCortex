/**
 * Tolerant export orchestration on top of the strict batch builder.
 *
 * `buildDatevBatch` is deliberately strict: it throws on data that must
 * never reach a DATEV file, and refuses batches spanning fiscal years.
 * Real months are messier — one broken receipt out of eighty must not
 * kill the export, and a January export naturally touches two fiscal
 * years. This layer:
 *
 *  1. maps every receipt individually and SKIPS the broken ones with the
 *     exact reason (visible, never silent),
 *  2. groups the rest by fiscal year and builds one file per year,
 *  3. renders one report the CLI and the MCP tool both print.
 */

import type { DatevConfig } from "./config.js";
import {
  buildDatevBatch,
  fiscalYearStartFor,
  mapReceiptToBooking,
  type DatevBatch,
  type ReceiptForExport,
} from "./exporter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkippedReceipt {
  readonly documentId: number;
  readonly reason: string;
}

export interface ExportRunResult {
  readonly batches: readonly DatevBatch[];
  readonly skipped: readonly SkippedReceipt[];
  readonly exportedCount: number;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/**
 * Build importable batches from a mixed bag of receipts: one file per
 * fiscal year, broken receipts skipped and reported.
 */
export function runDatevExport(
  receipts: readonly ReceiptForExport[],
  config: DatevConfig,
  generatedAt: Date = new Date(),
): ExportRunResult {
  const skipped: SkippedReceipt[] = [];
  const valid: ReceiptForExport[] = [];
  for (const receipt of receipts) {
    try {
      mapReceiptToBooking(receipt, config);
      valid.push(receipt);
    } catch (error) {
      skipped.push({
        documentId: receipt.documentId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const byFiscalYear = new Map<string, ReceiptForExport[]>();
  for (const receipt of valid) {
    const key = fiscalYearStartFor(
      new Date(`${receipt.date}T00:00:00Z`),
      config.fiscalYearStartMonth,
    );
    byFiscalYear.set(key, [...(byFiscalYear.get(key) ?? []), receipt]);
  }

  const batches = [...byFiscalYear.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => buildDatevBatch(group, config, generatedAt));

  return { batches, skipped, exportedCount: valid.length };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/** Human-readable summary; the CLI and the MCP tool print it verbatim. */
export function formatRunReport(result: ExportRunResult): string {
  const lines: string[] = [];
  for (const batch of result.batches) {
    lines.push(`✓ ${batch.filename}: ${batch.bookings.length} Buchung(en)`);
    for (const warning of batch.warnings) {
      lines.push(`  ⚠ ${warning}`);
    }
  }
  if (result.batches.length === 0) {
    lines.push("Keine exportierbaren Belege im gewaehlten Zeitraum.");
  }
  if (result.skipped.length > 0) {
    lines.push(
      "",
      `NICHT exportiert (${result.skipped.length} Beleg(e)) -- bitte pruefen:`,
    );
    for (const skip of result.skipped) {
      lines.push(`  ✗ Beleg #${skip.documentId}: ${skip.reason}`);
    }
  }
  return lines.join("\n");
}
