import { describe, expect, it } from "vitest";

import { datevConfigSchema, type DatevConfig } from "../config.js";
import { formatRunReport, runDatevExport } from "../export-run.js";
import type { ReceiptForExport } from "../exporter.js";

const CONFIG: DatevConfig = {
  ...datevConfigSchema.parse({
    consultantNumber: 29098,
    clientNumber: 55003,
    skr: "SKR03",
  }),
  moneyAccount: "1200",
};

function receipt(overrides: Partial<ReceiptForExport> = {}): ReceiptForExport {
  return {
    documentId: 42,
    vendor: "Bürobedarf Müller GmbH",
    date: "2026-09-15",
    totalAmount: 119,
    taxRate: 19,
    category: "office_supplies",
    currency: "EUR",
    ...overrides,
  };
}

describe("runDatevExport", () => {
  it("skips broken receipts with the reason and exports the rest", () => {
    const result = runDatevExport(
      [receipt(), receipt({ documentId: 77, totalAmount: -5 })],
      CONFIG,
    );
    expect(result.exportedCount).toBe(1);
    expect(result.batches).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.documentId).toBe(77);
    expect(result.skipped[0]!.reason).toContain("positive");
  });

  it("splits receipts across fiscal years into separate batches", () => {
    const result = runDatevExport(
      [
        receipt({ documentId: 1, date: "2025-12-30" }),
        receipt({ documentId: 2, date: "2026-01-02" }),
      ],
      CONFIG,
    );
    expect(result.batches).toHaveLength(2);
    expect(result.batches.map((b) => b.bookings.length)).toEqual([1, 1]);
    const names = result.batches.map((b) => b.filename);
    expect(new Set(names).size).toBe(2);
  });

  it("keeps the strict builder's warnings visible in the report", () => {
    const result = runDatevExport([receipt({ taxRate: null })], CONFIG);
    const report = formatRunReport(result);
    expect(report).toContain("⚠");
    expect(report).toContain("19% angenommen");
  });

  it("reports an empty period and skipped receipts honestly", () => {
    const empty = formatRunReport(runDatevExport([], CONFIG));
    expect(empty).toContain("Keine exportierbaren Belege");

    const skippedOnly = formatRunReport(
      runDatevExport([receipt({ documentId: 9, date: "kaputt" })], CONFIG),
    );
    expect(skippedOnly).toContain("NICHT exportiert");
    expect(skippedOnly).toContain("#9");
  });

  it("produces CP1252 content with the CRLF EXTF structure per batch", () => {
    const result = runDatevExport([receipt()], CONFIG);
    const lines = result.batches[0]!.file.toString("latin1").trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]!.startsWith('"EXTF";700;21;"Buchungsstapel";13;')).toBe(true);
    expect(lines[2]!.split(";")).toHaveLength(125);
    expect([...result.batches[0]!.file]).toContain(0xfc); // ü in "Müller"
  });
});
