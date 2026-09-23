import { describe, expect, it } from "vitest";

import {
  EXTF_COLUMNS,
  FIELD_POSITION,
  buildBookingRow,
  buildColumnRow,
  buildExtfFile,
  buildExtfHeader,
  encodeCp1252,
  formatAmount,
  formatDocumentDate,
  formatGeneratedAt,
  sanitizeText,
} from "../format.js";

const HEADER_INPUT = {
  consultantNumber: 29098,
  clientNumber: 55003,
  fiscalYearStart: "20260101",
  accountLength: 4,
  dateFrom: "20260901",
  dateTo: "20260930",
  label: "PaperCortex Belege",
  skrCode: "03",
  generatedAt: new Date(2026, 8, 24, 12, 30, 45, 123),
};

const BOOKING = {
  amount: 119,
  debitCredit: "S" as const,
  account: "4930",
  offsetAccount: "1200",
  taxKey: "9",
  documentDate: "1509",
  documentField1: "PC-42",
  postingText: "Bürobedarf Müller GmbH",
};

describe("EXTF header", () => {
  it("has exactly 31 fields with the batch metadata in place", () => {
    const fields = buildExtfHeader(HEADER_INPUT).split(";");
    expect(fields).toHaveLength(31);
    expect(fields[0]).toBe('"EXTF"');
    expect(fields[1]).toBe("700");
    expect(fields[2]).toBe("21");
    expect(fields[3]).toBe('"Buchungsstapel"');
    expect(fields[4]).toBe("13");
    expect(fields[5]).toBe("20260924123045123");
    expect(fields[10]).toBe("29098");
    expect(fields[11]).toBe("55003");
    expect(fields[12]).toBe("20260101");
    expect(fields[13]).toBe("4");
    expect(fields[14]).toBe("20260901");
    expect(fields[15]).toBe("20260930");
    expect(fields[18]).toBe("1");
    expect(fields[21]).toBe('"EUR"');
    expect(fields[26]).toBe('"03"');
  });
});

describe("column row", () => {
  it("carries the 125 labels of format version 13", () => {
    expect(EXTF_COLUMNS).toHaveLength(125);
    expect(EXTF_COLUMNS[0]).toBe("Umsatz (ohne Soll/Haben-Kz)");
    expect(EXTF_COLUMNS[FIELD_POSITION.account - 1]).toBe("Konto");
    expect(EXTF_COLUMNS[FIELD_POSITION.offsetAccount - 1]).toBe(
      "Gegenkonto (ohne BU-Schlüssel)",
    );
    expect(EXTF_COLUMNS[FIELD_POSITION.taxKey - 1]).toBe("BU-Schlüssel");
    expect(EXTF_COLUMNS[FIELD_POSITION.documentDate - 1]).toBe("Belegdatum");
    expect(EXTF_COLUMNS[FIELD_POSITION.documentField1 - 1]).toBe("Belegfeld 1");
    expect(EXTF_COLUMNS[FIELD_POSITION.postingText - 1]).toBe("Buchungstext");
    expect(EXTF_COLUMNS[FIELD_POSITION.lockFlag - 1]).toBe("Festschreibung");
    expect(buildColumnRow().split(";")).toHaveLength(125);
  });
});

describe("booking rows", () => {
  it("places every value at its documented position", () => {
    const fields = buildBookingRow(BOOKING).split(";");
    expect(fields).toHaveLength(125);
    expect(fields[FIELD_POSITION.amount - 1]).toBe("119,00");
    expect(fields[FIELD_POSITION.debitCredit - 1]).toBe('"S"');
    expect(fields[FIELD_POSITION.account - 1]).toBe("4930");
    expect(fields[FIELD_POSITION.offsetAccount - 1]).toBe("1200");
    expect(fields[FIELD_POSITION.taxKey - 1]).toBe('"9"');
    expect(fields[FIELD_POSITION.documentDate - 1]).toBe("1509");
    expect(fields[FIELD_POSITION.documentField1 - 1]).toBe('"PC-42"');
    expect(fields[FIELD_POSITION.postingText - 1]).toBe('"Bürobedarf Müller GmbH"');
    expect(fields[FIELD_POSITION.lockFlag - 1]).toBe("0");
  });
});

describe("value formatting", () => {
  it("formats amounts with comma decimals", () => {
    expect(formatAmount(1234.5)).toBe("1234,50");
    expect(formatAmount(0.07)).toBe("0,07");
  });

  it("formats document dates as DDMM and rejects garbage", () => {
    expect(formatDocumentDate("2026-09-15")).toBe("1509");
    expect(() => formatDocumentDate("15.09.2026")).toThrow("Invalid ISO date");
  });

  it("formats the generation timestamp with milliseconds", () => {
    expect(formatGeneratedAt(new Date(2026, 0, 2, 3, 4, 5, 6))).toBe(
      "20260102030405006",
    );
  });

  it("sanitizes text fields (separators, whitespace, length)", () => {
    expect(sanitizeText('A;B"C\nD', 60)).toBe("ABC D");
    expect(sanitizeText("x".repeat(80), 60)).toHaveLength(60);
  });
});

describe("CP1252 encoding", () => {
  it("encodes German characters and the euro sign correctly", () => {
    const bytes = encodeCp1252("äöüÄÖÜß€–");
    expect([...bytes]).toEqual([0xe4, 0xf6, 0xfc, 0xc4, 0xd6, 0xdc, 0xdf, 0x80, 0x96]);
  });

  it("replaces unmappable characters instead of corrupting the file", () => {
    expect([...encodeCp1252("a中b")]).toEqual([0x61, 0x3f, 0x62]);
  });
});

describe("complete file", () => {
  it("is CRLF-terminated CP1252 with header, labels, and bookings", () => {
    const file = buildExtfFile(HEADER_INPUT, [BOOKING, BOOKING]);
    const text = file.toString("latin1");
    const lines = text.split("\r\n");
    expect(lines).toHaveLength(5); // header + labels + 2 bookings + trailing empty
    expect(lines[0].startsWith('"EXTF";700;21;"Buchungsstapel";13;')).toBe(true);
    expect(lines[4]).toBe("");
    expect(text.includes("\n") && !text.includes("\r\n")).toBe(false);
  });
});
