/**
 * Robust parsing and validation of LLM receipt-extraction output.
 *
 * Local models routinely wrap their JSON in markdown fences, prepend a
 * sentence of prose, or drop fields entirely. This module turns that
 * reality into either a validated object or a clear error — never a crash
 * on the raw string and never silently-invented values beyond the
 * documented per-field defaults.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

/**
 * Pull the first complete JSON object out of an LLM response: strips
 * markdown fences and surrounding prose, then scans for balanced braces
 * (string-aware, so `{"a":"}"}` parses). Returns null when no parseable
 * object exists.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, "");
  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = inString;
    } else if (char === '"') {
      inString = !inString;
    } else if (!inString) {
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed: unknown = JSON.parse(cleaned.slice(start, i + 1));
            return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
              ? (parsed as Record<string, unknown>)
              : null;
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Missing/null → an explicit default BEFORE coercion. Coercing undefined
 * through z.coerce.string() would yield the literal string "undefined".
 */
function withDefault<T extends z.ZodTypeAny>(
  fallback: unknown,
  schema: T,
): z.ZodEffects<T> {
  return z.preprocess((value) => (value ?? fallback), schema) as z.ZodEffects<T>;
}

const optionalString = z
  .preprocess((v) => (typeof v === "string" && v.trim() !== "" ? v : null), z.string().nullable())
  .catch(null);

const optionalNumber = z
  .preprocess((v) => (typeof v === "number" && Number.isFinite(v) ? v : null), z.number().nullable())
  .catch(null);

const lineItemSchema = z
  .object({
    description: withDefault("", z.coerce.string().catch("")).catch(""),
    quantity: withDefault(1, z.coerce.number().catch(1)).catch(1),
    unitPrice: withDefault(0, z.coerce.number().catch(0)).catch(0),
    totalPrice: withDefault(0, z.coerce.number().catch(0)).catch(0),
    taxRate: optionalNumber,
  })
  .catch({ description: "", quantity: 1, unitPrice: 0, totalPrice: 0, taxRate: null });

/**
 * Field-level defaults are deliberate: a missing vendor becomes "Unknown"
 * (visible), a missing amount becomes 0 (rejected later by the exporter),
 * and an unparseable date stays as-is so the export layer can SKIP the
 * receipt with the real reason instead of silently booking "today".
 */
export const extractionSchema = z.object({
  vendor: withDefault(
    "Unknown",
    z.coerce.string().transform((s) => s.trim() || "Unknown").catch("Unknown"),
  ).catch("Unknown"),
  vendorAddress: optionalString,
  vendorTaxId: optionalString,
  date: withDefault("", z.coerce.string().catch("")).catch(""),
  currency: withDefault(
    "EUR",
    z.coerce.string().transform((s) => s.trim().toUpperCase() || "EUR").catch("EUR"),
  ).catch("EUR"),
  subtotal: optionalNumber,
  taxRate: optionalNumber,
  taxAmount: optionalNumber,
  totalAmount: withDefault(0, z.coerce.number().catch(0)).catch(0),
  paymentMethod: optionalString,
  lineItems: withDefault([], z.array(lineItemSchema).catch([])).catch([]),
  category: optionalString,
  confidence: withDefault(0.5, z.number().min(0).max(1).catch(0.5)).catch(0.5),
});

export type ValidatedExtraction = z.infer<typeof extractionSchema>;

/** Parse + validate one LLM response; null when no JSON object was found. */
export function parseExtractionResponse(text: string): ValidatedExtraction | null {
  const raw = extractJsonObject(text);
  if (raw === null) return null;
  return extractionSchema.parse(raw);
}
