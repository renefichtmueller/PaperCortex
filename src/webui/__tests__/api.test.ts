import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { afterAll, describe, expect, it } from "vitest";

import type { PaginatedResponse, PaperlessDocument, Tag } from "../../paperless/types.js";
import type { CachedReceipt, ReceiptCache } from "../../datev/receipt-cache.js";
import type { DatevService } from "../../datev/service.js";
import {
  buildExport,
  getSettings,
  listDocuments,
  previewBookings,
  readExportFile,
  runDoctor,
  saveSettings,
  type WebUiDeps,
} from "../api.js";
import { createAnalyzeJobs } from "../jobs.js";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const DIR = mkdtempSync(join(tmpdir(), "pcx-webui-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

function paginated<T>(results: readonly T[]): PaginatedResponse<T> {
  return { count: results.length, next: null, previous: null, results };
}

function cachedReceipt(overrides: Partial<CachedReceipt> = {}): CachedReceipt {
  return {
    documentId: 1,
    vendor: "Bäckerei Önal",
    vendorAddress: null,
    vendorTaxId: null,
    date: "2026-09-10",
    currency: "EUR",
    subtotal: null,
    taxRate: 19,
    taxAmount: null,
    totalAmount: 42.5,
    paymentMethod: null,
    lineItems: [],
    category: "food",
    confidence: 0.9,
    ...overrides,
  };
}

let depsCounter = 0;

function fakeDeps(overrides: Partial<WebUiDeps> = {}): WebUiDeps {
  depsCounter += 1;
  const store = new Map<number, CachedReceipt>([[1, cachedReceipt()]]);
  const cache: ReceiptCache = {
    get: (id) => store.get(id) ?? null,
    set: (r) => void store.set(r.documentId, cachedReceipt({ documentId: r.documentId })),
    remove: (id) => void store.delete(id),
    close: () => undefined,
  };
  const service: DatevService = {
    listReceiptDocuments: async () => [
      { id: 1, title: "Beleg 1", created: "2026-09-10", cached: cache.get(1) !== null },
      { id: 2, title: "Beleg 2", created: "2026-09-11", cached: cache.get(2) !== null },
    ],
    collectReceipts: async (ids) => ({
      receipts: [],
      failures: ids.map(() => ({ documentId: 0, error: "" })).slice(0, 0),
    }),
  };
  const paperless = {
    getDocuments: async () => paginated<PaperlessDocument>([]),
    getTags: async () =>
      paginated<Tag>([
        { id: 5, slug: "receipt", name: "receipt", color: "", text_color: "", match: "", matching_algorithm: 0, is_insensitive: true, is_inbox_tag: false, document_count: 12 },
      ]),
  } as unknown as WebUiDeps["paperless"];
  return {
    paperless,
    service,
    cache,
    vectorStore: { count: () => 3 },
    ollamaBaseUrl: "http://ollama.test",
    ollamaModel: "qwen2.5:14b",
    ollamaEmbeddingModel: "nomic-embed-text",
    exportDir: join(DIR, `exports-${depsCounter}`),
    configPath: join(DIR, `config-${depsCounter}.json`),
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({ models: [{ name: "qwen2.5:14b" }, { name: "nomic-embed-text:latest" }] }),
      )) as typeof fetch,
    ...overrides,
  };
}

const VALID_DATEV = {
  consultantNumber: 29098,
  clientNumber: 55003,
  skr: "SKR03",
  fiscalYearStartMonth: 1,
  accountLength: 4,
  defaultTaxRate: 19,
  accountOverrides: {},
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

describe("settings round-trip", () => {
  it("rejects invalid input with field-level errors", () => {
    const deps = fakeDeps();
    const result = saveSettings(deps, {
      datev: { ...VALID_DATEV, consultantNumber: 3 },
      receiptTag: "receipt",
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.[0].field).toBe("datev.consultantNumber");
    expect(result.errors?.[0].message).toContain("Beraternummer");
  });

  it("saves valid settings and serves them back with suggestions", () => {
    const deps = fakeDeps();
    expect(saveSettings(deps, { datev: VALID_DATEV, receiptTag: "Beleg" }).ok).toBe(true);
    const settings = getSettings(deps) as {
      datev: { consultantNumber: number };
      receiptTag: string;
      resolved: { moneyAccount: string };
      accountSuggestions: Record<string, { skr03: string; skr04: string }>;
    };
    expect(settings.datev.consultantNumber).toBe(29098);
    expect(settings.receiptTag).toBe("Beleg");
    expect(settings.resolved.moneyAccount).toBe("1200");
    expect(settings.accountSuggestions["travel"]).toEqual({ skr03: "4660", skr04: "6650" });
  });
});

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------

describe("runDoctor", () => {
  it("reports green when everything is wired", async () => {
    const deps = fakeDeps();
    saveSettings(deps, { datev: VALID_DATEV, receiptTag: "receipt" });
    const { checks } = await runDoctor(deps);
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    expect(byId["paperless"].status).toBe("ok");
    expect(byId["receipt-tag"].status).toBe("ok");
    expect(byId["ollama"].status).toBe("ok");
    expect(byId["ollama-model"].status).toBe("ok");
    expect(byId["ollama-embedding"].status).toBe("ok");
    expect(byId["vectors"].status).toBe("ok");
    expect(byId["datev"].status).toBe("ok");
  });

  it("tells the user exactly which model to pull when one is missing", async () => {
    const deps = fakeDeps({
      fetchImpl: (async () =>
        new Response(JSON.stringify({ models: [{ name: "nomic-embed-text" }] }))) as typeof fetch,
    });
    const { checks } = await runDoctor(deps);
    const model = checks.find((c) => c.id === "ollama-model");
    expect(model?.status).toBe("fail");
    expect(model?.detail).toContain("ollama pull qwen2.5:14b");
  });

  it("fails the Paperless check with an actionable hint", async () => {
    const deps = fakeDeps({
      paperless: {
        getDocuments: async () => { throw new Error("connect ECONNREFUSED"); },
        getTags: async () => paginated<Tag>([]),
      } as unknown as WebUiDeps["paperless"],
    });
    const { checks } = await runDoctor(deps);
    const paperless = checks.find((c) => c.id === "paperless");
    expect(paperless?.status).toBe("fail");
    expect(paperless?.detail).toContain("PAPERLESS_URL");
  });
});

// ---------------------------------------------------------------------------
// Documents, preview, export
// ---------------------------------------------------------------------------

describe("documents and preview", () => {
  it("lists documents with the uncached ones called out", async () => {
    const deps = fakeDeps();
    const result = (await listDocuments(deps, "2026-09-01", "2026-09-30")) as {
      uncachedIds: number[];
    };
    expect(result.uncachedIds).toEqual([2]);
  });

  it("rejects a reversed date range in German", async () => {
    await expect(listDocuments(fakeDeps(), "2026-09-30", "2026-09-01")).rejects.toThrow(
      "Zeitraum",
    );
  });

  it("previews cached bookings and refuses without DATEV config", async () => {
    const deps = fakeDeps();
    await expect(previewBookings(deps, "2026-09-01", "2026-09-30")).rejects.toThrow(
      "DATEV-Einstellungen",
    );
    saveSettings(deps, { datev: VALID_DATEV, receiptTag: "receipt" });
    const preview = (await previewBookings(deps, "2026-09-01", "2026-09-30")) as {
      bookings: { documentId: number; account: string }[];
      uncachedIds: number[];
    };
    expect(preview.bookings).toHaveLength(1);
    expect(preview.bookings[0].account).toBe("4650");
    expect(preview.uncachedIds).toEqual([2]);
  });
});

describe("export files", () => {
  it("writes the batch, reports it, and serves only safe filenames", async () => {
    const deps = fakeDeps();
    saveSettings(deps, { datev: VALID_DATEV, receiptTag: "receipt" });
    const result = (await buildExport(deps, "2026-09-01", "2026-09-30", [])) as {
      files: { name: string }[];
      report: string;
    };
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("EXTF_Buchungsstapel_20260910_20260910.csv");
    expect(result.report).toContain("1 Buchung");
    expect(existsSync(join(deps.exportDir, result.files[0].name))).toBe(true);

    expect(readExportFile(deps, result.files[0].name)?.content.length).toBeGreaterThan(0);
    expect(readExportFile(deps, "../secrets.txt")).toBeNull();
    expect(readExportFile(deps, "EXTF_Buchungsstapel_20260910_20260910.csv/../x")).toBeNull();
  });

  it("honours excluded documents", async () => {
    const deps = fakeDeps();
    saveSettings(deps, { datev: VALID_DATEV, receiptTag: "receipt" });
    await expect(buildExport(deps, "2026-09-01", "2026-09-30", [1])).rejects.toThrow(
      "Keine analysierten Belege",
    );
  });
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

describe("analyze jobs", () => {
  it("runs one job at a time and reports completion", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const service: DatevService = {
      listReceiptDocuments: async () => [],
      collectReceipts: async (ids, options) => {
        await gate;
        options?.onProgress?.(ids.length, ids.length);
        return { receipts: [], failures: [{ documentId: 7, error: "kaputt" }] };
      },
    };
    const jobs = createAnalyzeJobs(service);
    expect(jobs.start([1, 2], false)).toBe(true);
    expect(jobs.start([3], false)).toBe(false);
    expect(jobs.status().state).toBe("running");
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(jobs.status().state).toBe("done");
    expect(jobs.status().errors).toEqual([{ documentId: 7, error: "kaputt" }]);
  });
});
