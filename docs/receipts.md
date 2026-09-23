# Receipt Workflow

## Overview

PaperCortex provides a complete receipt-to-accounting pipeline:

1. **Scan** -- Upload receipts to Paperless-ngx (scan, email, photo)
2. **Extract** -- AI extracts structured data (vendor, date, amounts, line items)
3. **Match** -- Reconcile against bank CSV exports
4. **Export** -- Generate DATEV-compatible CSV for accounting software

## Receipt Extraction

### Via MCP Server (Claude Code)

```
Extract receipt data from document #1234
```

### Via CLI

```bash
npm run receipt:extract -- --document-id 1234
```

### Extracted Fields

| Field | Description | Example |
|---|---|---|
| vendor | Company name | "IKEA Deutschland GmbH" |
| vendorAddress | Full address | "Am Wanderweg 1, 65719 Hofheim" |
| vendorTaxId | Tax ID / VAT number | "DE 129 341 800" |
| date | Receipt date | "2024-03-15" |
| currency | ISO 4217 code | "EUR" |
| subtotal | Before tax | 84.03 |
| taxRate | Tax percentage | 19 |
| taxAmount | Tax amount | 15.97 |
| totalAmount | Total with tax | 100.00 |
| paymentMethod | How it was paid | "card" |
| lineItems | Individual items | Array of items |
| category | Expense category | "office_supplies" |

## Bank Statement Matching

Match receipts against bank CSV exports to verify which receipts correspond to which bank transactions.

### Supported Bank Formats

- Sparkasse (semicolon-separated, German format)
- ING (semicolon-separated)
- DKB (semicolon-separated)
- Volksbank (semicolon-separated)
- Generic CSV

### Matching Algorithm

1. **Amount match** -- Exact or close amount (within 1.00 tolerance)
2. **Date proximity** -- Same day, within 3 days, or within 7 days
3. **Vendor name** -- Partial match in transaction description

Results include a confidence score (0.0 - 1.0) and match reasons.

## DATEV Export

The DATEV pipeline has its own step-by-step guide: **[datev.md](datev.md)**.

Quick reference:

```bash
npm run datev:init                        # one-time setup wizard
npm run datev:check  -- --month 2026-08   # dry run with full report
npm run datev:export -- --month 2026-08   # write EXTF file(s) to ./exports
```

Via MCP Server:

```
Export documents #100, #101, #102 as DATEV
```

The tool writes the EXTF file(s) to the export directory and reports every
receipt it skipped, with the reason.
