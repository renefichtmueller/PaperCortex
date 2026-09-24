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

/** OCR shorter than this is likely a failed scan -- prefer the image. */
const MIN_OCR_CHARS = 150;
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i;
const STRICT_RETRY_SUFFIX =
  "\n\nIMPORTANT: Your previous answer was not parseable. Respond with ONLY the raw JSON object -- no markdown fences, no explanation, no text before or after it.";

function visionAvailable(ollama: OllamaClient): boolean {
  return typeof ollama.supportsVision === "function" && ollama.supportsVision();
}

export function createReceiptExtractor(
  config: ReceiptExtractorConfig,
): ReceiptExtractor {
  const { ollama, paperless } = config;

  // Local models regularly wrap the JSON in markdown fences or prose, so
  // parse tolerantly and give the model exactly one sterner retry.
  async function attemptText(prompt: string): Promise<ReturnType<typeof parseExtractionResponse>> {
    const first = await ollama.complete(prompt, EXTRACTION_SYSTEM_PROMPT);
    const parsed = parseExtractionResponse(first.text);
    if (parsed !== null) return parsed;
    const retry = await ollama.complete(prompt, EXTRACTION_SYSTEM_PROMPT + STRICT_RETRY_SUFFIX);
    return parseExtractionResponse(retry.text);
  }

  // Vision path for photo receipts whose OCR came out thin or useless:
  // original file when it IS an image, otherwise the rendered first-page
  // thumbnail (phone scans usually arrive as single-page PDFs).
  async function attemptVision(
    document: { readonly id: number; readonly original_file_name?: string },
  ): Promise<ReturnType<typeof parseExtractionResponse>> {
    try {
      const isImage = IMAGE_EXTENSIONS.test(document.original_file_name ?? "");
      const bytes = isImage
        ? await paperless.downloadDocument(document.id)
        : await paperless.downloadThumbnail(document.id);
      const image = Buffer.from(bytes).toString("base64");
      const prompt = "Read this receipt image carefully and extract the data.";
      const first = await ollama.completeVision(prompt, EXTRACTION_SYSTEM_PROMPT, [image]);
      const parsed = parseExtractionResponse(first.text);
      if (parsed !== null) return parsed;
      const retry = await ollama.completeVision(
        prompt,
        EXTRACTION_SYSTEM_PROMPT + STRICT_RETRY_SUFFIX,
        [image],
      );
      return parseExtractionResponse(retry.text);
    } catch {
      return null;
    }
  }

  async function extractSingle(documentId: number): Promise<ReceiptData> {
    const document = await paperless.getDocument(documentId);
    const ocrText = (document.content ?? "").trim();
    const vision = visionAvailable(ollama);

    if (ocrText.length === 0 && !vision) {
      throw new Error(
        `Document ${documentId} has no OCR content. Ensure Paperless-ngx has processed the document.`,
      );
    }

    const prompt = `Extract receipt data from the following OCR text:\n\n---\n${ocrText}\n---`;
    let validated: ReturnType<typeof parseExtractionResponse> = null;
    if (ocrText.length >= MIN_OCR_CHARS || !vision) {
      validated = await attemptText(prompt);
      if (validated === null && vision) validated = await attemptVision(document);
    } else {
      validated = await attemptVision(document);
      if (validated === null && ocrText.length > 0) validated = await attemptText(prompt);
    }

    if (validated === null) {
      throw new Error(
        `Document ${documentId}: the model returned no parseable JSON in two attempts` +
        `${vision ? " (text and vision)" : ""} -- check that OLLAMA_MODEL` +
        `${vision ? "/OLLAMA_VISION_MODEL" : ""} suits structured extraction.`,
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
