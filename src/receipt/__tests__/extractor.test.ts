import { describe, expect, it, vi } from "vitest";

import type { OllamaClient } from "../../embeddings/ollama.js";
import type { PaperlessClient } from "../../paperless/client.js";
import { createReceiptExtractor } from "../extractor.js";

const GOOD_JSON = '{"vendor":"Bäckerei Önal","date":"2026-09-10","totalAmount":42.5,"taxRate":7,"currency":"EUR","confidence":0.9}';

function fakePaperless(content = "REWE Markt ..."): PaperlessClient {
  return {
    getDocument: async (id: number) => ({ id, content, title: "Beleg" }),
  } as unknown as PaperlessClient;
}

function fakeOllama(responses: readonly string[]): { client: OllamaClient; complete: ReturnType<typeof vi.fn> } {
  let call = 0;
  const complete = vi.fn(async () => ({ text: responses[Math.min(call++, responses.length - 1)], model: "m", totalDuration: 1 }));
  return { client: { complete } as unknown as OllamaClient, complete };
}

describe("createReceiptExtractor", () => {
  it("parses a fenced response on the first attempt", async () => {
    const { client, complete } = fakeOllama(["```json\n" + GOOD_JSON + "\n```"]);
    const extractor = createReceiptExtractor({ ollama: client, paperless: fakePaperless() });
    const receipt = await extractor.extract(42);
    expect(receipt.vendor).toBe("Bäckerei Önal");
    expect(receipt.totalAmount).toBe(42.5);
    expect(receipt.documentId).toBe(42);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("retries once with a sterner instruction when the first answer is prose", async () => {
    const { client, complete } = fakeOllama(["Sorry, hier die Daten als Fliesstext ...", GOOD_JSON]);
    const extractor = createReceiptExtractor({ ollama: client, paperless: fakePaperless() });
    const receipt = await extractor.extract(42);
    expect(receipt.vendor).toBe("Bäckerei Önal");
    expect(complete).toHaveBeenCalledTimes(2);
    expect(String(complete.mock.calls[1][1])).toContain("ONLY the raw JSON object");
  });

  it("fails with a clear error after two unparseable answers", async () => {
    const { client } = fakeOllama(["kein json", "immer noch kein json"]);
    const extractor = createReceiptExtractor({ ollama: client, paperless: fakePaperless() });
    await expect(extractor.extract(42)).rejects.toThrow("no parseable JSON in two attempts");
  });

  it("still refuses documents without OCR content", async () => {
    const { client } = fakeOllama([GOOD_JSON]);
    const extractor = createReceiptExtractor({ ollama: client, paperless: fakePaperless("   ") });
    await expect(extractor.extract(42)).rejects.toThrow("no OCR content");
  });
});

describe("vision fallback", () => {
  function visionOllama(textAnswers: readonly string[], visionAnswer: string) {
    const base = fakeOllama(textAnswers);
    const completeVision = vi.fn(async () => ({ text: visionAnswer, model: "v", totalDuration: 1 }));
    const client = {
      ...base.client,
      supportsVision: () => true,
      completeVision,
    } as unknown as OllamaClient;
    return { client, completeVision, complete: base.complete };
  }

  function visionPaperless(content: string, originalFileName: string) {
    const downloadDocument = vi.fn(async () => new TextEncoder().encode("img").buffer);
    const downloadThumbnail = vi.fn(async () => new TextEncoder().encode("thumb").buffer);
    return {
      client: {
        getDocument: async (id: number) => ({ id, content, title: "Beleg", original_file_name: originalFileName }),
        downloadDocument,
        downloadThumbnail,
      } as unknown as PaperlessClient,
      downloadDocument,
      downloadThumbnail,
    };
  }

  it("uses the original image directly when OCR is thin", async () => {
    const { client, completeVision, complete } = visionOllama([GOOD_JSON], GOOD_JSON);
    const paperless = visionPaperless("kzt", "beleg.jpg");
    const extractor = createReceiptExtractor({ ollama: client, paperless: paperless.client });
    const receipt = await extractor.extract(7);
    expect(receipt.vendor).toBe("Bäckerei Önal");
    expect(completeVision).toHaveBeenCalledTimes(1);
    expect(paperless.downloadDocument).toHaveBeenCalledTimes(1);
    expect(paperless.downloadThumbnail).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("falls back to the thumbnail for PDFs and to vision after text fails", async () => {
    const longOcr = "x".repeat(300);
    const { client, completeVision } = visionOllama(["prose", "still prose"], GOOD_JSON);
    const paperless = visionPaperless(longOcr, "scan.pdf");
    const extractor = createReceiptExtractor({ ollama: client, paperless: paperless.client });
    const receipt = await extractor.extract(8);
    expect(receipt.vendor).toBe("Bäckerei Önal");
    expect(paperless.downloadThumbnail).toHaveBeenCalledTimes(1);
    expect(completeVision).toHaveBeenCalledTimes(1);
  });
});
