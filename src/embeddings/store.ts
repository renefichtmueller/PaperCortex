/**
 * Local SQLite-backed vector store for document embeddings.
 *
 * Stores embedding vectors alongside document metadata in a SQLite database
 * using better-sqlite3. Supports cosine similarity search for semantic
 * document retrieval.
 *
 * @example
 * ```ts
 * const store = createVectorStore({ dbPath: "./data/vectors.db" });
 * await store.upsert({ documentId: 42, vector: [...], content: "..." });
 * const results = await store.search(queryVector, { limit: 10 });
 * ```
 */

import { mkdirSync } from "fs";
import { dirname } from "path";

import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorStoreConfig {
  readonly dbPath: string;
}

export interface DocumentEmbedding {
  readonly documentId: number;
  readonly vector: readonly number[];
  readonly content: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
}

export interface SearchResult {
  readonly documentId: number;
  readonly title: string;
  readonly content: string;
  readonly score: number;
  readonly tags: readonly string[];
}

export interface SearchOptions {
  readonly limit?: number;
  readonly minScore?: number;
  readonly tagFilter?: readonly string[];
}

export interface VectorStore {
  /** Insert or update a document embedding. */
  upsert(embedding: DocumentEmbedding): void;

  /** Search for similar documents using cosine similarity. */
  search(queryVector: readonly number[], options?: SearchOptions): readonly SearchResult[];

  /** Remove an embedding by document ID. */
  remove(documentId: number): void;

  /** Get the total count of stored embeddings. */
  count(): number;

  /** Check if a document has been embedded. */
  has(documentId: number): boolean;

  /** Close the database connection. */
  close(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 */
function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`,
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a local vector store backed by SQLite.
 *
 * TODO: Consider migrating to sqlite-vss or DuckDB for ANN search at scale.
 * The current brute-force approach works well for <100k documents.
 */
export function createVectorStore(config: VectorStoreConfig): VectorStore {
  // A fresh checkout has no ./data yet; better-sqlite3 refuses to create
  // missing directories and the whole service dies on first start.
  mkdirSync(dirname(config.dbPath), { recursive: true });
  const db = new Database(config.dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");

  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS embeddings (
      document_id INTEGER PRIMARY KEY,
      vector BLOB NOT NULL,
      content TEXT NOT NULL,
      title TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_embeddings_created
      ON embeddings (created_at);
  `);

  // Prepared statements for performance
  const upsertStmt = db.prepare(`
    INSERT INTO embeddings (document_id, vector, content, title, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(document_id) DO UPDATE SET
      vector = excluded.vector,
      content = excluded.content,
      title = excluded.title,
      tags = excluded.tags,
      updated_at = datetime('now')
  `);

  const getAllStmt = db.prepare(`
    SELECT document_id, vector, content, title, tags FROM embeddings
  `);

  const removeStmt = db.prepare(`
    DELETE FROM embeddings WHERE document_id = ?
  `);

  const countStmt = db.prepare(`
    SELECT COUNT(*) as count FROM embeddings
  `);

  const hasStmt = db.prepare(`
    SELECT 1 FROM embeddings WHERE document_id = ? LIMIT 1
  `);

  return {
    upsert(embedding) {
      const vectorBlob = Buffer.from(new Float32Array(embedding.vector).buffer);
      upsertStmt.run(
        embedding.documentId,
        vectorBlob,
        embedding.content,
        embedding.title,
        JSON.stringify(embedding.tags),
        embedding.createdAt,
      );
    },

    search(queryVector, options = {}) {
      const { limit = 10, minScore = 0.5, tagFilter } = options;

      // TODO: Implement ANN (approximate nearest neighbor) for large datasets
      // Current approach: brute-force scan -- fine for <100k documents

      interface EmbeddingRow {
        document_id: number;
        vector: Buffer;
        content: string;
        title: string;
        tags: string;
      }

      const rows = getAllStmt.all() as EmbeddingRow[];

      const scored = rows
        .map((row) => {
          const storedVector = Array.from(new Float32Array(row.vector.buffer));
          const tags: string[] = JSON.parse(row.tags);
          const score = cosineSimilarity(queryVector, storedVector);

          return {
            documentId: row.document_id,
            title: row.title,
            content: row.content,
            score,
            tags,
          };
        })
        .filter((result) => result.score >= minScore)
        .filter((result) => {
          if (!tagFilter || tagFilter.length === 0) return true;
          return tagFilter.some((tag) => result.tags.includes(tag));
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return scored;
    },

    remove(documentId) {
      removeStmt.run(documentId);
    },

    count() {
      const row = countStmt.get() as { count: number };
      return row.count;
    },

    has(documentId) {
      return hasStmt.get(documentId) !== undefined;
    },

    close() {
      db.close();
    },
  };
}
