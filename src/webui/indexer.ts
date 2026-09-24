/**
 * Search-index builder: embeds Paperless documents into the local vector
 * store. This is the answer to "how do I populate the vector store?" --
 * before this, nothing ever wrote to it and semantic search returned
 * nothing forever.
 *
 * Runs as a background job (embedding takes ~a second per document) with
 * the same polling contract as the receipt analysis.
 */

import type { PaginatedResponse, PaperlessDocument } from "../paperless/types.js";
import type { WebUiDeps } from "./api.js";

const PAGE_SIZE = 100;
const MAX_PAGES = 500;
/** Embedding models have a bounded context; more text adds no recall. */
const EMBED_MAX_CHARS = 6000;

export interface IndexRunResult {
  readonly indexed: number;
  readonly skipped: number;
  readonly errors: readonly { documentId: number; error: string }[];
}

export interface IndexJobStatus {
  readonly state: "idle" | "running" | "done" | "failed";
  readonly total: number;
  readonly done: number;
  readonly indexed: number;
  readonly skipped: number;
  readonly errors: readonly { documentId: number; error: string }[];
  readonly message?: string;
}

export interface IndexJob {
  /** Start indexing; returns false while a run is already active. */
  start(refresh: boolean): boolean;
  status(): IndexJobStatus;
}

type IndexerDeps = Pick<WebUiDeps, "paperless" | "embed" | "vectorStore">;

async function listAllDocuments(
  deps: IndexerDeps,
): Promise<readonly PaperlessDocument[]> {
  const documents: PaperlessDocument[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response: PaginatedResponse<PaperlessDocument> =
      await deps.paperless.getDocuments({ page, page_size: PAGE_SIZE, ordering: "id" });
    documents.push(...response.results);
    if (!response.next) break;
  }
  return documents;
}

/** Embed one document into the store; tagNames resolves tag ids to names. */
async function indexDocument(
  deps: IndexerDeps,
  document: PaperlessDocument,
  tagNames: ReadonlyMap<number, string>,
): Promise<void> {
  const content = (document.content ?? "").trim();
  if (content === "") {
    throw new Error("kein OCR-Text vorhanden");
  }
  const text = `${document.title}\n\n${content}`.slice(0, EMBED_MAX_CHARS);
  const { vector } = await deps.embed(text);
  deps.vectorStore.upsert({
    documentId: document.id,
    vector,
    content: content.slice(0, 1000),
    title: document.title,
    tags: document.tags.map((id) => tagNames.get(id) ?? String(id)),
    createdAt: document.created,
  });
}

export function createIndexJob(deps: IndexerDeps): IndexJob {
  let current: IndexJobStatus = {
    state: "idle", total: 0, done: 0, indexed: 0, skipped: 0, errors: [],
  };

  async function run(refresh: boolean): Promise<void> {
    const tags = await deps.paperless.getTags();
    const tagNames = new Map(tags.results.map((t) => [t.id, t.name]));
    const documents = await listAllDocuments(deps);
    current = { ...current, total: documents.length };

    let indexed = 0;
    let skipped = 0;
    const errors: { documentId: number; error: string }[] = [];
    let done = 0;
    for (const document of documents) {
      if (!refresh && deps.vectorStore.has(document.id)) {
        skipped += 1;
      } else {
        try {
          await indexDocument(deps, document, tagNames);
          indexed += 1;
        } catch (error) {
          errors.push({
            documentId: document.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      done += 1;
      current = { ...current, done, indexed, skipped, errors };
    }
    current = { ...current, state: "done" };
  }

  return {
    start(refresh) {
      if (current.state === "running") return false;
      current = { state: "running", total: 0, done: 0, indexed: 0, skipped: 0, errors: [] };
      void run(refresh).catch((error: unknown) => {
        current = {
          ...current,
          state: "failed",
          message: error instanceof Error ? error.message : String(error),
        };
      });
      return true;
    },

    status() {
      return current;
    },
  };
}
