import { describe, expect, it } from "vitest";

import { createTransactionMatcher, normalizeBankDate } from "../matcher.js";

const GERMAN_CSV = [
  "Buchungstag;Verwendungszweck;Betrag;Waehrung",
  "15.09.2026;Kartenzahlung REWE SAGT DANKE 4401;-42,50;EUR",
  "16.09.2026;LASTSCHRIFT Telekom Deutschland;-1.059,99;EUR",
  "20.09.2026;GEHALT SEPTEMBER;3.000,00;EUR",
].join("\n");

describe("normalizeBankDate", () => {
  it("converts German bank dates to ISO and passes ISO through", () => {
    expect(normalizeBankDate("01.09.2026")).toBe("2026-09-01");
    expect(normalizeBankDate("01.09.26")).toBe("2026-09-01");
    expect(normalizeBankDate("2026-09-01")).toBe("2026-09-01");
    expect(normalizeBankDate("unbekannt")).toBe("unbekannt");
  });
});

describe("parseBankCsvText", () => {
  it("parses a German semicolon export with thousands separators", () => {
    const txns = createTransactionMatcher().parseBankCsvText(GERMAN_CSV);
    expect(txns).toHaveLength(3);
    expect(txns[0].date).toBe("2026-09-15");
    expect(txns[0].amount).toBe(-42.5);
    expect(txns[1].amount).toBe(-1059.99);
    expect(txns[1].description).toContain("Telekom");
  });
});

describe("matchReceipts", () => {
  it("matches on amount, date proximity, and vendor in the description", () => {
    const matcher = createTransactionMatcher();
    const txns = matcher.parseBankCsvText(GERMAN_CSV);
    const summary = matcher.matchReceipts(
      [
        { documentId: 1, vendor: "REWE Markt", date: "2026-09-15", totalAmount: 42.5, currency: "EUR" },
        { documentId: 2, vendor: "Bäckerei Önal", date: "2026-09-14", totalAmount: 3.2, currency: "EUR" },
      ],
      txns,
    );
    expect(summary.matched).toHaveLength(1);
    expect(summary.matched[0].receipt.documentId).toBe(1);
    expect(summary.matched[0].matchReasons).toContain("exact_amount_match");
    expect(summary.matched[0].matchReasons).toContain("same_day");
    expect(summary.matched[0].matchReasons).toContain("vendor_in_description");
    expect(summary.unmatchedReceipts.map((r) => r.documentId)).toEqual([2]);
    expect(summary.unmatchedTransactions).toHaveLength(2);
  });
});
