import { describe, expect, it } from "vitest";

import { datevConfigSchema, type DatevConfig } from "../config.js";
import {
  buildDatevBatch,
  fiscalYearStartFor,
  mapReceiptToBooking,
  type ReceiptForExport,
} from "../exporter.js";

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
    confidence: 0.92,
    ...overrides,
  };
}

describe("mapReceiptToBooking", () => {
  it("maps a clean receipt without warnings", () => {
    const booking = mapReceiptToBooking(receipt(), CONFIG);
    expect(booking.account).toBe("4930");
    expect(booking.offsetAccount).toBe("1200");
    expect(booking.taxKey).toBe("9");
    expect(booking.warnings).toEqual([]);
  });

  it("uses SKR04 accounts when configured", () => {
    const config = { ...CONFIG, skr: "SKR04" as const, moneyAccount: "1800" };
    const booking = mapReceiptToBooking(receipt(), config);
    expect(booking.account).toBe("6815");
    expect(booking.offsetAccount).toBe("1800");
  });

  it("respects per-category account overrides", () => {
    const config = { ...CONFIG, accountOverrides: { office_supplies: "4444" } };
    expect(mapReceiptToBooking(receipt(), config).account).toBe("4444");
  });

  it("assumes the configured default tax rate with a warning", () => {
    const booking = mapReceiptToBooking(receipt({ taxRate: null }), CONFIG);
    expect(booking.taxKey).toBe("9");
    expect(booking.warnings.join(" ")).toContain("19% angenommen");
  });

  it("warns on unusual tax rates and exports without a BU key", () => {
    const booking = mapReceiptToBooking(receipt({ taxRate: 16 }), CONFIG);
    expect(booking.taxKey).toBe("");
    expect(booking.warnings.join(" ")).toContain("Ungewöhnlicher Steuersatz");
  });

  it("warns on unknown categories and low confidence", () => {
    const booking = mapReceiptToBooking(
      receipt({ category: "yacht", confidence: 0.3 }),
      CONFIG,
    );
    expect(booking.account).toBe("4900");
    expect(booking.warnings.join(" ")).toContain("Sammelkonto");
    expect(booking.warnings.join(" ")).toContain("Erkennungssicherheit");
  });

  it("rejects bad dates, non-positive amounts, and foreign currency", () => {
    expect(() => mapReceiptToBooking(receipt({ date: "15.09.2026" }), CONFIG)).toThrow(
      "invalid date",
    );
    expect(() => mapReceiptToBooking(receipt({ totalAmount: 0 }), CONFIG)).toThrow(
      "positive",
    );
    expect(() => mapReceiptToBooking(receipt({ currency: "USD" }), CONFIG)).toThrow(
      "EUR-only",
    );
  });
});

describe("payment methods", () => {
  const config = { ...CONFIG, cashAccount: "1000", cardAccount: "1360" };

  it("books cash receipts against the cash account", () => {
    const booking = mapReceiptToBooking(receipt({ paymentMethod: "Barzahlung" }), config);
    expect(booking.paymentKind).toBe("cash");
    expect(booking.offsetAccount).toBe("1000");
  });

  it("books card receipts against the card account", () => {
    const booking = mapReceiptToBooking(receipt({ paymentMethod: "EC-Karte kontaktlos" }), config);
    expect(booking.paymentKind).toBe("card");
    expect(booking.offsetAccount).toBe("1360");
  });

  it("defaults unknown methods to the money account", () => {
    const booking = mapReceiptToBooking(receipt({ paymentMethod: null }), config);
    expect(booking.paymentKind).toBe("bank");
    expect(booking.offsetAccount).toBe("1200");
  });
});

describe("Festschreibung", () => {
  it("marks header and every row when lockBookings is enabled", () => {
    const locked = buildDatevBatch([receipt()], { ...CONFIG, lockBookings: true });
    const lines = locked.file.toString("latin1").trim().split("\r\n");
    expect(lines[0].split(";")[20]).toBe("1");
    expect(lines[2].split(";")[113]).toBe("1");

    const open = buildDatevBatch([receipt()], CONFIG);
    const openLines = open.file.toString("latin1").trim().split("\r\n");
    expect(openLines[0].split(";")[20]).toBe("0");
    expect(openLines[2].split(";")[113]).toBe("0");
  });
});

describe("arithmetic sanity checks", () => {
  it("stays quiet when the printed amounts add up", () => {
    const booking = mapReceiptToBooking(
      receipt({ subtotal: 100, taxAmount: 19, totalAmount: 119 }),
      CONFIG,
    );
    expect(booking.warnings).toEqual([]);
  });

  it("warns when net plus tax misses the gross amount", () => {
    const booking = mapReceiptToBooking(
      receipt({ subtotal: 90, taxAmount: 19, totalAmount: 119 }),
      CONFIG,
    );
    expect(booking.warnings.join(" ")).toContain("ergibt nicht Brutto");
  });

  it("warns when the tax amount does not match the tax rate", () => {
    const booking = mapReceiptToBooking(
      receipt({ subtotal: null, taxAmount: 5, totalAmount: 119, taxRate: 19 }),
      CONFIG,
    );
    expect(booking.warnings.join(" ")).toContain("passt nicht zu 19%");
  });
});

describe("duplicate detection", () => {
  it("flags same vendor, date, and amount on every affected booking", () => {
    const batch = buildDatevBatch(
      [
        receipt({ documentId: 1 }),
        receipt({ documentId: 2 }),
        receipt({ documentId: 3, totalAmount: 50 }),
      ],
      CONFIG,
    );
    const flagged = batch.bookings.filter((b) =>
      b.warnings.some((w) => w.includes("Doppel-Scan")),
    );
    expect(flagged.map((b) => b.documentId)).toEqual([1, 2]);
    expect(flagged[0].warnings.join(" ")).toContain("#2");
    expect(batch.bookings[2].warnings).toEqual([]);
  });
});

describe("fiscal year handling", () => {
  it("computes the fiscal year start around the boundary", () => {
    expect(fiscalYearStartFor(new Date("2026-09-15T00:00:00Z"), 1)).toBe("20260101");
    expect(fiscalYearStartFor(new Date("2026-03-15T00:00:00Z"), 4)).toBe("20250401");
    expect(fiscalYearStartFor(new Date("2026-04-01T00:00:00Z"), 4)).toBe("20260401");
  });
});

describe("buildDatevBatch", () => {
  it("builds an importable file with range, filename, and previews", () => {
    const batch = buildDatevBatch(
      [
        receipt({ documentId: 1, date: "2026-09-03" }),
        receipt({ documentId: 2, date: "2026-09-15", taxRate: 7, category: "food" }),
      ],
      CONFIG,
      new Date(2026, 8, 24, 12, 0, 0),
    );
    expect(batch.filename).toBe("EXTF_Buchungsstapel_20260903_20260915.csv");
    expect(batch.bookings).toHaveLength(2);
    expect(batch.bookings[1].taxKey).toBe("8");
    const text = batch.file.toString("latin1");
    expect(text).toContain(";20260903;20260915;");
    expect(text).toContain('"PC-1"');
  });

  it("refuses batches spanning two fiscal years", () => {
    expect(() =>
      buildDatevBatch(
        [receipt({ date: "2025-12-30" }), receipt({ date: "2026-01-02", documentId: 43 })],
        CONFIG,
      ),
    ).toThrow("one batch per fiscal year");
  });

  it("refuses empty exports", () => {
    expect(() => buildDatevBatch([], CONFIG)).toThrow("No receipts");
  });

  it("aggregates booking warnings with document context", () => {
    const batch = buildDatevBatch([receipt({ taxRate: null })], CONFIG);
    expect(batch.warnings[0]).toContain("Beleg 42:");
  });
});
