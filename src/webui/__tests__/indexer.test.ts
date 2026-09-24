import { describe, expect, it, vi } from "vitest";

import type { PaperlessDocument, Tag } from "../../paperless/types.js";
import type { WebUiDeps } from "../api.js";
import { createIndexJob } from "../indexer.js";

function doc(id: number, content = `Inhalt ${id}`): PaperlessDocument {
  return {
    id, content, title: `Dokument ${id}`, tags: [5],
    created: "2026-09-01T00:00:00Z", created_date: "2026-09-01",
  } as unknown as PaperlessDocument;
}

function fakeDeps(documents: PaperlessDocument[], preIndexed: number[] = []) {
  const upserts: number[] = [];
  const embed = vi.fn(async () => ({ vector: [0.1, 0.2] }));
  const deps = {
    paperless: {
      getDocuments: async ({ page = 1, page_size = 100 }: { page?: number; page_size?: number }) => {
        const start = (page - 1) * page_size;
        const slice = documents.slice(start, start + page_size);
        return {
          count: documents.length,
          next: start + page_size < documents.length ? "next" : null,
          previous: null,
          results: slice,
        };
      },
      getTags: async () => ({
        count: 1, next: null, previous: null,
        results: [{ id: 5, name: "receipt" } as unknown as Tag],
      }),
    },
    embed,
    vectorStore: {
      count: () => upserts.length,
      has: (id: number) => preIndexed.includes(id),
      upsert: (e: { documentId: number }) => void upserts.push(e.documentId),
    },
  } as unknown as Pick<WebUiDeps, "paperless" | "embed" | "vectorStore">;
  return { deps, upserts, embed };
}

async function waitForDone(job: ReturnType<typeof createIndexJob>): Promise<void> {
  for (let i = 0; i < 100 && job.status().state === "running"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("embedding window", () => {
  it("halves the text on context-length errors until it fits", async () => {
    const calls: number[] = [];
    const docs = [doc(1, "x".repeat(6000))];
    const { deps } = fakeDeps(docs);
    const failing = {
      ...deps,
      embed: vi.fn(async (text: string) => {
        calls.push(text.length);
        if (text.length > 2000) throw new Error('Ollama API error: 500 -- {"error":"the input length exceeds the context length"}');
        return { vector: [0.1] };
      }),
    };
    const job = createIndexJob(failing);
    job.start(false);
    await waitForDone(job);
    expect(job.status().indexed).toBe(1);
    expect(job.status().errors).toEqual([]);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls[calls.length - 1]).toBeLessThanOrEqual(2000);
  });

  it("surfaces non-context errors unchanged", async () => {
    const { deps } = fakeDeps([doc(1)]);
    const failing = {
      ...deps,
      embed: vi.fn(async () => { throw new Error("connection refused"); }),
    };
    const job = createIndexJob(failing);
    job.start(false);
    await waitForDone(job);
    expect(job.status().errors[0].error).toContain("connection refused");
  });
});

describe("search index job", () => {
  it("indexes all pages, resolves tag names, reports progress", async () => {
    const { deps, upserts } = fakeDeps([doc(1), doc(2), doc(3)]);
    const job = createIndexJob(deps);
    expect(job.start(false)).toBe(true);
    expect(job.start(false)).toBe(false);
    await waitForDone(job);
    const status = job.status();
    expect(status.state).toBe("done");
    expect(status.total).toBe(3);
    expect(status.indexed).toBe(3);
    expect(upserts).toEqual([1, 2, 3]);
  });

  it("skips already indexed documents unless refresh is set", async () => {
    const { deps, upserts } = fakeDeps([doc(1), doc(2)], [1]);
    const job = createIndexJob(deps);
    job.start(false);
    await waitForDone(job);
    expect(job.status().skipped).toBe(1);
    expect(upserts).toEqual([2]);

    const refreshed = fakeDeps([doc(1), doc(2)], [1]);
    const job2 = createIndexJob(refreshed.deps);
    job2.start(true);
    await waitForDone(job2);
    expect(refreshed.upserts).toEqual([1, 2]);
  });

  it("reports documents without OCR text as per-document errors", async () => {
    const { deps, upserts } = fakeDeps([doc(1), doc(2, "   ")]);
    const job = createIndexJob(deps);
    job.start(false);
    await waitForDone(job);
    const status = job.status();
    expect(status.state).toBe("done");
    expect(status.indexed).toBe(1);
    expect(status.errors).toEqual([{ documentId: 2, error: "kein OCR-Text vorhanden" }]);
    expect(upserts).toEqual([1]);
  });
});
