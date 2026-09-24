/**
 * Receipt data extraction using local LLM via Ollama.
 *
 * Extracts structured data from receipt documents: vendor, date, amounts,
 * tax breakdown, line items, and payment method. Uses the Paperless-ngx
 * OCR content and enriches it with LLM analysis.
 *
 * @example
 * ```ts
 * const extractor = createReceiptExtractor({ ollama, paperless });
 * const receipt = await extractor.extract(documentId);
 * console.log(receipt.vendor, receipt.totalAmount, receipt.taxAmount);
 * ```
 */

import type { OllamaClient } from "../embeddings/ollama.js";
import type { PaperlessClient } from "../paperless/client.js";
import { parseExtractionResponse } from "./extraction-parse.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReceiptData {
  readonly documentId: number;
  readonly vendor: string;
  readonly vendorAddress: string | null;
  readonly vendorTaxId: string | null;
  readonly date: string;
  readonly currency: string;
  readonly subtotal: number | null;
  readonly taxRate: number | null;
  readonly taxAmount: number | null;
  readonly totalAmount: number;
  readonly paymentMethod: string | null;
  readonly lineItems: readonly LineItem[];
  readonly category: string | null;
  readonly confidence: number;
  readonly rawText: string;
}

export interface LineItem {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly totalPrice: number;
  readonly taxRate: number | null;
}

export interface ReceiptExtractorConfig {
  readonly ollama: OllamaClient;
  readonly paperless: PaperlessClient;
}

export interface ReceiptExtractor {
  /** Extract structured receipt data from a Paperless-ngx document. */
  extract(documentId: number): Promise<ReceiptData>;

  /** Batch-extract receipts from multiple documents. */
  extractBatch(documentIds: readonly number[]): Promise<readonly ReceiptData[]>;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `You are a receipt data extraction assistant. Given the OCR text of a receipt, extract structured data in JSON format.

Extract the following fields:
- vendor: Company/store name
- vendorAddress: Full address if visible
- vendorTaxId: Tax ID / VAT number if visible (e.g., USt-IdNr, Steuernummer)
- date: Date in ISO 8601 format (YYYY-MM-DD)
- currency: ISO 4217 currency code (e.g., EUR, USD)
- subtotal: Amount before tax (null if not distinguishable)
- taxRate: Tax percentage as decimal (e.g., 19 for 19%)
- taxAmount: Tax amount
- totalAmount: Total amount including tax
- paymentMethod: Payment method if visible (cash, card, etc.)
- lineItems: Array of { description, quantity, unitPrice, totalPrice, taxRate }
- category: Suggested expense category (office_supplies, travel, food, etc.)
- confidence: Your confidence in the extraction (0.0 to 1.0)

Respond ONLY with valid JSON. No explanation, no markdown.`;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a receipt data extractor.
 *
 * TODO: Add support for image-based receipts (pass images to multimodal LLM)
 * TODO: Add receipt template matching for common vendors
 * TODO: Add currency conversion support
 */
export function createReceiptExtractor(
  config: ReceiptExtractorConfig,
): ReceiptExtractor {
  const { ollama, paperless } = config;

  async function extractSingle(documentId: number): Promise<ReceiptData> {
    // Fetch the document content from Paperless-ngx
    const document = await paperless.getDocument(documentId);
    const ocrText = document.content;

    if (!ocrText || ocrText.trim().length === 0) {
      throw new Error(
        `Document ${documentId} has no OCR content. Ensure Paperless-ngx has processed the document.`,
      );
    }

    // Send to Ollama for structured extraction. Local models regularly wrap
    // the JSON in markdown fences or prose, so parse tolerantly and give
    // the model exactly one sterner retry before giving up with a clear
    // error (the export layer reports it per document, nothing crashes).
    const prompt = `Extract receipt data from the following OCR text:\n\n---\n${ocrText}\n---`;
    const completion = await ollama.complete(prompt, EXTRACTION_SYSTEM_PROMPT);
    let validated = parseExtractionResponse(completion.text);
    if (validated === null) {
      const retry = await ollama.complete(
        prompt,
        `${EXTRACTION_SYSTEM_PROMPT}\n\nIMPORTANT: Your previous answer was not parseable. Respond with ONLY the raw JSON object -- no markdown fences, no explanation, no text before or after it.`,
      );
      validated = parseExtractionResponse(retry.text);
    }
    if (validated === null) {
      throw new Error(
        `Document ${documentId}: the model returned no parseable JSON in two attempts -- ` +
        `check that OLLAMA_MODEL suits structured extraction.`,
      );
    }

    return { documentId, ...validated, rawText: ocrText };
  }

  return {
    extract: extractSingle,

    async extractBatch(documentIds) {
      // TODO: Add concurrency control (process N at a time)
      // TODO: Add progress reporting callback
      const results: ReceiptData[] = [];
      for (const id of documentIds) {
        const result = await extractSingle(id);
        results.push(result);
      }
      return results;
    },
  };
}
