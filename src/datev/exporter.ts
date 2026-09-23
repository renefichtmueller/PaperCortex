/**
 * Receipt → DATEV booking-batch exporter.
 *
 * Turns extracted receipt data into a validated EXTF Buchungsstapel. The
 * design goal is "no silent garbage": every assumption (missing tax rate,
 * unknown category, low extraction confidence) becomes a visible warning
 * on the specific booking, and hard errors (bad date, non-positive amount,
 * batch spanning two fiscal years) refuse to export at all.
 */

import { resolveExpenseAccount, type Skr } from "./accounts.js";
import type { DatevConfig } from "./config.js";
import { buildExtfFile, formatDocumentDate, type ExtfBookingRow } from "./format.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReceiptForExport {
  readonly documentId: number;
  readonly vendor: string;
  /** ISO date YYYY-MM-DD. */
  readonly date: string;
  readonly totalAmount: number;
  readonly taxRate: number | null;
  readonly category: string | null;
  readonly currency?: string;
  readonly confidence?: number;
}

export interface BookingPreview {
  readonly documentId: number;
  readonly vendor: string;
  readonly date: string;
  readonly amount: number;
  readonly account: string;
  readonly offsetAccount: string;
  readonly taxKey: string;
  readonly taxRate: number;
  readonly postingText: string;
  readonly warnings: readonly string[];
}

export interface DatevBatch {
  readonly file: Buffer;
  readonly filename: string;
  readonly bookings: readonly BookingPreview[];
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Vorsteuer BU-Schluessel per German VAT rate on purchase receipts. */
const TAX_KEYS: Record<number, string> = { 19: "9", 7: "8", 0: "" };

const LOW_CONFIDENCE_THRESHOLD = 0.6;

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Fiscal year start (as YYYYMMDD) that contains the given date. */
export function fiscalYearStartFor(date: Date, startMonth: number): string {
  const month = date.getUTCMonth() + 1;
  const year =
    month >= startMonth ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${year}${String(startMonth).padStart(2, "0")}01`;
}

function compactDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/**
 * Map one receipt to a booking preview. Throws on data that must never
 * reach a DATEV file; collects warnings for everything a human should
 * glance at before handing the file to the tax advisor.
 */
export function mapReceiptToBooking(
  receipt: ReceiptForExport,
  config: DatevConfig,
): BookingPreview {
  if (parseIsoDate(receipt.date) === null) {
    throw new Error(
      `Document ${receipt.documentId}: invalid date "${receipt.date}" (expected YYYY-MM-DD)`,
    );
  }
  if (!(receipt.totalAmount > 0)) {
    throw new Error(
      `Document ${receipt.documentId}: amount must be positive, got ${receipt.totalAmount}`,
    );
  }

  const warnings: string[] = [];
  if (receipt.currency && receipt.currency !== "EUR") {
    throw new Error(
      `Document ${receipt.documentId}: currency ${receipt.currency} is not supported; DATEV batches are EUR-only here`,
    );
  }

  let taxRate = receipt.taxRate;
  if (taxRate === null || taxRate === undefined) {
    taxRate = config.defaultTaxRate;
    warnings.push(`Kein Steuersatz erkannt, ${taxRate}% angenommen`);
  }
  let taxKey = TAX_KEYS[taxRate];
  if (taxKey === undefined) {
    taxKey = "";
    warnings.push(
      `Ungewöhnlicher Steuersatz ${taxRate}%: ohne BU-Schlüssel exportiert, bitte prüfen`,
    );
  } else if (taxRate === 0) {
    warnings.push("Steuersatz 0%: als steuerfrei exportiert");
  }

  const { account, usedFallback } = resolveExpenseAccount(
    receipt.category,
    config.skr as Skr,
    config.accountOverrides,
  );
  if (usedFallback) {
    warnings.push(
      `Kategorie "${receipt.category ?? "unbekannt"}" nicht zugeordnet, Sammelkonto ${account} verwendet`,
    );
  }
  if (
    receipt.confidence !== undefined &&
    receipt.confidence < LOW_CONFIDENCE_THRESHOLD
  ) {
    warnings.push("Niedrige Erkennungssicherheit, Beleg bitte gegenprüfen");
  }

  return {
    documentId: receipt.documentId,
    vendor: receipt.vendor,
    date: receipt.date,
    amount: receipt.totalAmount,
    account,
    offsetAccount: config.moneyAccount ?? "",
    taxKey,
    taxRate,
    postingText: receipt.vendor,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Batch building
// ---------------------------------------------------------------------------

function assertSingleFiscalYear(
  dates: readonly Date[],
  startMonth: number,
): string {
  const starts = new Set(dates.map((d) => fiscalYearStartFor(d, startMonth)));
  if (starts.size > 1) {
    throw new Error(
      "Receipts span more than one fiscal year; DATEV requires one batch per fiscal year. Export the periods separately.",
    );
  }
  return [...starts][0];
}

/**
 * Build a complete, importable DATEV batch from extracted receipts.
 */
export function buildDatevBatch(
  receipts: readonly ReceiptForExport[],
  config: DatevConfig,
  generatedAt: Date = new Date(),
): DatevBatch {
  if (receipts.length === 0) {
    throw new Error("No receipts to export.");
  }

  const bookings = receipts.map((r) => mapReceiptToBooking(r, config));
  const dates = receipts.map((r) => parseIsoDate(r.date) as Date);
  const fiscalYearStart = assertSingleFiscalYear(
    dates,
    config.fiscalYearStartMonth,
  );

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const dateFrom = compactDate(sorted[0]);
  const dateTo = compactDate(sorted[sorted.length - 1]);

  const rows: ExtfBookingRow[] = bookings.map((b) => ({
    amount: b.amount,
    debitCredit: "S",
    account: b.account,
    offsetAccount: b.offsetAccount,
    taxKey: b.taxKey,
    documentDate: formatDocumentDate(b.date),
    documentField1: `PC-${b.documentId}`,
    postingText: b.postingText,
  }));

  const file = buildExtfFile(
    {
      consultantNumber: config.consultantNumber,
      clientNumber: config.clientNumber,
      fiscalYearStart,
      accountLength: config.accountLength,
      dateFrom,
      dateTo,
      label: `PaperCortex Belege ${dateFrom}-${dateTo}`,
      skrCode: config.skr === "SKR03" ? "03" : "04",
      generatedAt,
    },
    rows,
  );

  return {
    file,
    filename: `EXTF_Buchungsstapel_${dateFrom}_${dateTo}.csv`,
    bookings,
    warnings: bookings.flatMap((b) =>
      b.warnings.map((w) => `Beleg ${b.documentId}: ${w}`),
    ),
  };
}
