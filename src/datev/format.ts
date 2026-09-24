/**
 * DATEV-Format primitives: EXTF header (version 700), Buchungsstapel
 * format version 13 (125 columns), value formatting, and CP1252 output.
 *
 * This module is deliberately dumb: it formats exactly what it is given.
 * Validation, account mapping, and fiscal-year handling live one level
 * up in exporter.ts and export-run.ts.
 *
 * @see https://developer.datev.de/datev/platform/en/dtvf/formate
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtfHeaderInput {
  readonly consultantNumber: number;
  readonly clientNumber: number;
  /** Fiscal year begin as YYYYMMDD. */
  readonly fiscalYearStart: string;
  /** G/L account number length (Sachkontenlaenge), 4-8. */
  readonly accountLength: number;
  /** Batch range begin as YYYYMMDD. */
  readonly dateFrom: string;
  /** Batch range end as YYYYMMDD. */
  readonly dateTo: string;
  /** Batch label, max 30 characters. */
  readonly label: string;
  /** Chart of accounts code: "03" or "04". */
  readonly skrCode: string;
  /** Header field 21: mark the whole batch festgeschrieben (GoBD). */
  readonly lockBookings?: boolean;
  readonly generatedAt: Date;
}

export interface BookingRow {
  /** Festschreibung flag for field 114 (GoBD lock). */
  readonly locked?: boolean;
  readonly amount: number;
  readonly debitCredit: "S" | "H";
  /** Konto — for an expense booking in Soll: the expense account. */
  readonly account: string;
  /** Gegenkonto — the money account (bank/cash). */
  readonly offsetAccount: string;
  readonly taxKey: string;
  /** Belegdatum as DDMM. */
  readonly documentDate: string;
  readonly documentField1: string;
  readonly postingText: string;
}

/** Alias used by exporter.ts. */
export type ExtfBookingRow = BookingRow;

// ---------------------------------------------------------------------------
// Column layout (Buchungsstapel format version 13)
// ---------------------------------------------------------------------------

/** 1-based field positions this exporter writes. */
export const FIELD_POSITION = {
  amount: 1,
  debitCredit: 2,
  currency: 3,
  account: 7,
  offsetAccount: 8,
  taxKey: 9,
  documentDate: 10,
  documentField1: 11,
  postingText: 14,
  lockFlag: 114,
} as const;

function beleginfoColumns(): string[] {
  const columns: string[] = [];
  for (let i = 1; i <= 8; i++) {
    columns.push(`Beleginfo - Art ${i}`, `Beleginfo - Inhalt ${i}`);
  }
  return columns;
}

function zusatzColumns(): string[] {
  const columns: string[] = [];
  for (let i = 1; i <= 20; i++) {
    columns.push(`Zusatzinformation - Art ${i}`, `Zusatzinformation - Inhalt ${i}`);
  }
  return columns;
}

/** All 125 column labels of Buchungsstapel format version 13, in order. */
export const EXTF_COLUMNS: readonly string[] = [
  "Umsatz (ohne Soll/Haben-Kz)",
  "Soll/Haben-Kennzeichen",
  "WKZ Umsatz",
  "Kurs",
  "Basis-Umsatz",
  "WKZ Basis-Umsatz",
  "Konto",
  "Gegenkonto (ohne BU-Schlüssel)",
  "BU-Schlüssel",
  "Belegdatum",
  "Belegfeld 1",
  "Belegfeld 2",
  "Skonto",
  "Buchungstext",
  "Postensperre",
  "Diverse Adressnummer",
  "Geschäftspartnerbank",
  "Sachverhalt",
  "Zinssperre",
  "Beleglink",
  ...beleginfoColumns(),
  "KOST1 - Kostenstelle",
  "KOST2 - Kostenstelle",
  "Kost-Menge",
  "EU-Land u. UStID (Bestimmung)",
  "EU-Steuersatz (Bestimmung)",
  "Abw. Versteuerungsart",
  "Sachverhalt L+L",
  "Funktionsergänzung L+L",
  "BU 49 Hauptfunktionstyp",
  "BU 49 Hauptfunktionsnummer",
  "BU 49 Funktionsergänzung",
  ...zusatzColumns(),
  "Stück",
  "Gewicht",
  "Zahlweise",
  "Forderungsart",
  "Veranlagungsjahr",
  "Zugeordnete Fälligkeit",
  "Skontotyp",
  "Auftragsnummer",
  "Buchungstyp",
  "USt-Schlüssel (Anzahlungen)",
  "EU-Land (Anzahlungen)",
  "Sachverhalt L+L (Anzahlungen)",
  "EU-Steuersatz (Anzahlungen)",
  "Erlöskonto (Anzahlungen)",
  "Herkunft-Kz",
  "Buchungs GUID",
  "KOST-Datum",
  "SEPA-Mandatsreferenz",
  "Skontosperre",
  "Gesellschaftername",
  "Beteiligtennummer",
  "Identifikationsnummer",
  "Zeichnernummer",
  "Postensperre bis",
  "Bezeichnung SoBil-Sachverhalt",
  "Kennzeichen SoBil-Buchung",
  "Festschreibung",
  "Leistungsdatum",
  "Datum Zuord. Steuerperiode",
  "Fälligkeit",
  "Generalumkehr (GU)",
  "Steuersatz",
  "Land",
  "Abrechnungsreferenz",
  "BVV-Position",
  "EU-Land u. UStID (Ursprung)",
  "EU-Steuersatz (Ursprung)",
  "Abw. Skontokonto",
];

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

/** Amount with comma decimals, always two places, no thousands separator. */
export function formatAmount(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

/** ISO date (YYYY-MM-DD) to DATEV Belegdatum (DDMM). */
export function formatDocumentDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match || Number.isNaN(Date.parse(isoDate))) {
    throw new Error(`Invalid ISO date: "${isoDate}"`);
  }
  return `${match[3]}${match[2]}`;
}

/** Generation timestamp as YYYYMMDDHHMMSSFFF (local time). */
export function formatGeneratedAt(date: Date): string {
  const pad = (n: number, width: number): string => String(n).padStart(width, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}` +
    `${pad(date.getHours(), 2)}${pad(date.getMinutes(), 2)}${pad(date.getSeconds(), 2)}` +
    pad(date.getMilliseconds(), 3)
  );
}

/** Strip separators and control characters, collapse whitespace, cap length. */
export function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/[";]/g, "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

// ---------------------------------------------------------------------------
// CP1252 encoding
// ---------------------------------------------------------------------------

const CP1252_EXTRAS = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

/** Encode text as CP1252 ("ANSI"); unmappable characters become "?". */
export function encodeCp1252(text: string): Buffer {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0xff && !(code >= 0x80 && code <= 0x9f)) {
      bytes[i] = code;
    } else {
      bytes[i] = CP1252_EXTRAS.get(code) ?? 0x3f;
    }
  }
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

/** EXTF meta header (version 700): exactly 31 fields. */
export function buildExtfHeader(input: ExtfHeaderInput): string {
  const fields = [
    `"EXTF"`, "700", "21", `"Buchungsstapel"`, "13",
    formatGeneratedAt(input.generatedAt),
    "", `"PC"`, `"PaperCortex"`, "",
    String(input.consultantNumber),
    String(input.clientNumber),
    input.fiscalYearStart,
    String(input.accountLength),
    input.dateFrom,
    input.dateTo,
    `"${sanitizeText(input.label, 30)}"`,
    `""`,
    "1",
    "0",
    input.lockBookings ? "1" : "0",
    `"EUR"`,
    "", `""`, "", `""`,
    `"${input.skrCode}"`,
    "", `""`, `""`, `""`,
  ];
  return fields.join(";");
}

/** The quoted 125-label caption row. */
export function buildColumnRow(): string {
  return EXTF_COLUMNS.map((c) => `"${c}"`).join(";");
}

/** One 125-field booking data row. */
export function buildBookingRow(booking: BookingRow): string {
  const fields = new Array<string>(EXTF_COLUMNS.length).fill("");
  fields[FIELD_POSITION.amount - 1] = formatAmount(booking.amount);
  fields[FIELD_POSITION.debitCredit - 1] = `"${booking.debitCredit}"`;
  fields[FIELD_POSITION.currency - 1] = `"EUR"`;
  fields[FIELD_POSITION.account - 1] = booking.account;
  fields[FIELD_POSITION.offsetAccount - 1] = booking.offsetAccount;
  fields[FIELD_POSITION.taxKey - 1] = `"${booking.taxKey}"`;
  fields[FIELD_POSITION.documentDate - 1] = booking.documentDate;
  fields[FIELD_POSITION.documentField1 - 1] = `"${sanitizeText(booking.documentField1, 36)}"`;
  fields[FIELD_POSITION.postingText - 1] = `"${sanitizeText(booking.postingText, 60)}"`;
  fields[FIELD_POSITION.lockFlag - 1] = booking.locked ? "1" : "0";
  return fields.join(";");
}

/** Complete CP1252 EXTF file: header, captions, bookings, CRLF-terminated. */
export function buildExtfFile(
  header: ExtfHeaderInput,
  bookings: readonly BookingRow[],
): Buffer {
  const lines = [
    buildExtfHeader(header),
    buildColumnRow(),
    ...bookings.map(buildBookingRow),
  ];
  return encodeCp1252(lines.join("\r\n") + "\r\n");
}
