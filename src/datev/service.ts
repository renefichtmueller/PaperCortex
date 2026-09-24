/**
 * DATEV service: collects receipt documents from Paperless-ngx, runs (or
 * reuses cached) LLM extraction, and hands validated data to the batch
 * builder. Shared by the web UI, the MCP export tool, and the CLI.
 */

import type { PaperlessClient } from "../paperless/client.js";
import type { PaperlessDocument } from "../paperless/types.js";
import { createReceiptExtractor, type ReceiptExtractor } from "../receipt/extractor.js";
import type { OllamaClient } from "../embeddings/ollama.js";
import type { CachedReceipt, ReceiptCache } from "./receipt-cache.js";
import type { ReceiptForExport } from "./exporter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DatevServiceConfig {
  readonly paperless: PaperlessClient;
  readonly ollama: OllamaClient;
  readonly cache: ReceiptCache;
}

export interface ReceiptDocumentSummary {
  readonly id: number;
  readonly title: string;
  readonly created: string;
  readonly cached: boolean;
}

export interface CollectResult {
  readonly receipts: readonly ReceiptForExport[];
  readonly failures: readonly { documentId: number; error: string }[];
}

export interface DatevService {
  /** Resolve the receipt tag and list matching documents in a date range. */
  listReceiptDocuments(
    tagName: string,
    from: string,
    to: string,
  ): Promise<readonly ReceiptDocumentSummary[]>;

  /** Extract (cache-first) receipt data for the given documents. */
  collectReceipts(
    documentIds: readonly number[],
    options?: { refresh?: boolean; onProgress?: (done: number, total: number) => void },
  ): Promise<CollectResult>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function toExportShape(receipt: CachedReceipt): ReceiptForExport {
  return {
    documentId: receipt.documentId,
    vendor: receipt.vendor,
    date: receipt.date,
    totalAmount: receipt.totalAmount,
    taxRate: receipt.taxRate,
    category: receipt.category,
    currency: receipt.currency,
    confidence: receipt.confidence,
    subtotal: receipt.subtotal,
    taxAmount: receipt.taxAmount,
    paymentMethod: receipt.paymentMethod,
  };
}

async function fetchAllPages(
  paperless: PaperlessClient,
  tagId: number,
  from: string,
  to: string,
): Promise<PaperlessDocument[]> {
  const documents: PaperlessDocument[] = [];
  for (let page = 1; page <= 50; page++) {
    const response = await paperless.getDocuments({
      tags__id__all: [tagId],
      created__date__gte: from,
      created__date__lte: to,
      ordering: "created",
      page,
      page_size: 100,
    });
    documents.push(...response.results);
    if (!response.next) break;
  }
  return documents;
}

export function createDatevService(config: DatevServiceConfig): DatevService {
  const { paperless, ollama, cache } = config;
  const extractor: ReceiptExtractor = createReceiptExtractor({ ollama, paperless });

  return {
    async listReceiptDocuments(tagName, from, to) {
      const tags = await paperless.getTags();
      const tag = tags.results.find(
        (t) => t.name.toLowerCase() === tagName.toLowerCase(),
      );
      if (!tag) {
        const available = tags.results.map((t) => t.name).join(", ");
        throw new Error(
          `Tag "${tagName}" not found in Paperless-ngx. Available tags: ${available || "none"}`,
        );
      }
      const documents = await fetchAllPages(paperless, tag.id, from, to);
      return documents.map((d) => ({
        id: d.id,
        title: d.title,
        created: d.created_date ?? d.created.slice(0, 10),
        cached: cache.get(d.id) !== null,
      }));
    },

    async collectReceipts(documentIds, options = {}) {
      const receipts: ReceiptForExport[] = [];
      const failures: { documentId: number; error: string }[] = [];
      let done = 0;
      for (const id of documentIds) {
        const cached = options.refresh ? null : cache.get(id);
        if (cached) {
          receipts.push(toExportShape(cached));
        } else {
          try {
            const extracted = await extractor.extract(id);
            cache.set(extracted);
            receipts.push(toExportShape(extracted));
          } catch (error) {
            failures.push({
              documentId: id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        done += 1;
        options.onProgress?.(done, documentIds.length);
      }
      return { receipts, failures };
    },
  };
}
