/**
 * SQLite cache for extracted receipt data.
 *
 * LLM extraction takes seconds per document; caching per document id makes
 * the export preview instant on the second visit and lets a re-run only
 * touch new documents. The raw OCR text is deliberately NOT cached to keep
 * the database small.
 */

import Database from "better-sqlite3";

import type { ReceiptData } from "../receipt/extractor.js";

export type CachedReceipt = Omit<ReceiptData, "rawText">;

export interface ReceiptCache {
  get(documentId: number): CachedReceipt | null;
  set(receipt: ReceiptData): void;
  remove(documentId: number): void;
  close(): void;
}

export function createReceiptCache(dbPath: string): ReceiptCache {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS receipt_cache (
      document_id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const getStmt = db.prepare("SELECT data FROM receipt_cache WHERE document_id = ?");
  const setStmt = db.prepare(`
    INSERT INTO receipt_cache (document_id, data, extracted_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(document_id) DO UPDATE SET
      data = excluded.data,
      extracted_at = datetime('now')
  `);
  const removeStmt = db.prepare("DELETE FROM receipt_cache WHERE document_id = ?");

  return {
    get(documentId) {
      const row = getStmt.get(documentId) as { data: string } | undefined;
      if (!row) return null;
      try {
        return JSON.parse(row.data) as CachedReceipt;
      } catch {
        return null;
      }
    },

    set(receipt) {
      const { rawText: _rawText, ...cacheable } = receipt;
      setStmt.run(receipt.documentId, JSON.stringify(cacheable));
    },

    remove(documentId) {
      removeStmt.run(documentId);
    },

    close() {
      db.close();
    },
  };
}
