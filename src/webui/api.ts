/**
 * Web UI API layer: settings, system check, receipt preview, and export.
 *
 * Pure request/response logic with injected dependencies so every handler
 * is testable without HTTP, Paperless, or Ollama. The HTTP wiring lives in
 * server.ts, the browser page in page.ts.
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { z } from "zod";

import { knownCategories, resolveExpenseAccount } from "../datev/accounts.js";
import {
  configFilePath,
  datevConfigSchema,
  loadStoredConfig,
  resolveDatevConfig,
  saveStoredConfig,
  storedConfigSchema,
  type StoredConfig,
} from "../datev/config.js";
import { formatRunReport, runDatevExport } from "../datev/export-run.js";
import { mapReceiptToBooking, type BookingPreview } from "../datev/exporter.js";
import type { ReceiptCache } from "../datev/receipt-cache.js";
import type { DatevService } from "../datev/service.js";
import type { PaperlessClient } from "../paperless/client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebUiDeps {
  readonly paperless: PaperlessClient;
  readonly service: DatevService;
  readonly cache: ReceiptCache;
  readonly vectorStore: { count(): number };
  readonly ollamaBaseUrl: string;
  readonly ollamaModel: string;
  readonly ollamaEmbeddingModel: string;
  readonly exportDir: string;
  readonly configPath?: string;
  readonly fetchImpl?: typeof fetch;
}

export interface DoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly status: "ok" | "warn" | "fail";
  readonly detail: string;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als JJJJ-MM-TT angeben");

const EXPORT_FILENAME = /^EXTF_Buchungsstapel_\d{8}_\d{8}\.csv$/;

function cfgPath(deps: WebUiDeps): string {
  return deps.configPath ?? configFilePath();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Which DATEV_* environment overrides are active (they beat the UI). */
function activeEnvOverrides(): readonly string[] {
  return [
    "DATEV_CONSULTANT_NUMBER", "DATEV_CLIENT_NUMBER", "DATEV_SKR",
    "DATEV_FISCAL_YEAR_START_MONTH", "DATEV_ACCOUNT_LENGTH",
    "DATEV_MONEY_ACCOUNT", "DATEV_DEFAULT_TAX_RATE",
  ].filter((key) => (process.env[key] ?? "") !== "");
}

/** Category → default account for both charts, as UI placeholder data. */
function accountSuggestions(): Record<string, { skr03: string; skr04: string }> {
  const suggestions: Record<string, { skr03: string; skr04: string }> = {};
  for (const category of knownCategories()) {
    suggestions[category] = {
      skr03: resolveExpenseAccount(category, "SKR03").account,
      skr04: resolveExpenseAccount(category, "SKR04").account,
    };
  }
  return suggestions;
}

export function getSettings(deps: WebUiDeps): Record<string, unknown> {
  const stored = loadStoredConfig(cfgPath(deps));
  let resolved: ReturnType<typeof resolveDatevConfig> = null;
  let envError: string | null = null;
  try {
    resolved = resolveDatevConfig(stored);
  } catch (error) {
    envError = error instanceof Error ? error.message : String(error);
  }
  return {
    datev: stored.datev ?? null,
    receiptTag: stored.receiptTag,
    resolved,
    envOverrides: activeEnvOverrides(),
    envError,
    accountSuggestions: accountSuggestions(),
    connections: {
      paperlessUrl: process.env["PAPERLESS_URL"] ?? "",
      paperlessTokenSet: Boolean(process.env["PAPERLESS_TOKEN"]),
      ollamaUrl: deps.ollamaBaseUrl,
      ollamaModel: deps.ollamaModel,
      ollamaEmbeddingModel: deps.ollamaEmbeddingModel,
    },
  };
}

const saveBodySchema = z.object({
  datev: datevConfigSchema.nullable(),
  receiptTag: z.string().min(1, "Beleg-Tag darf nicht leer sein").default("receipt"),
});

export function saveSettings(
  deps: WebUiDeps,
  body: unknown,
): { ok: boolean; errors?: { field: string; message: string }[] } {
  const parsed = saveBodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    };
  }
  const next: StoredConfig = storedConfigSchema.parse({
    datev: parsed.data.datev ?? undefined,
    receiptTag: parsed.data.receiptTag,
  });
  saveStoredConfig(next, cfgPath(deps));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// System check
// ---------------------------------------------------------------------------

async function checkPaperless(deps: WebUiDeps): Promise<DoctorCheck[]> {
  const stored = loadStoredConfig(cfgPath(deps));
  try {
    const documents = await deps.paperless.getDocuments({ page_size: 1 });
    const tags = await deps.paperless.getTags();
    const tag = tags.results.find(
      (t) => t.name.toLowerCase() === stored.receiptTag.toLowerCase(),
    );
    return [
      {
        id: "paperless", label: "Paperless-ngx erreichbar", status: "ok",
        detail: `${documents.count} Dokumente gefunden`,
      },
      tag
        ? {
            id: "receipt-tag", label: `Beleg-Tag "${stored.receiptTag}"`, status: "ok",
            detail: `${tag.document_count} Dokumente tragen den Tag`,
          }
        : {
            id: "receipt-tag", label: `Beleg-Tag "${stored.receiptTag}"`, status: "warn",
            detail:
              "Tag existiert in Paperless nicht. In den Einstellungen einen vorhandenen Tag " +
              `wählen (verfügbar: ${tags.results.map((t) => t.name).join(", ") || "keine"})`,
          },
    ];
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return [{
      id: "paperless", label: "Paperless-ngx erreichbar", status: "fail",
      detail: `${detail} — PAPERLESS_URL und PAPERLESS_TOKEN in der .env prüfen`,
    }];
  }
}

async function checkOllama(deps: WebUiDeps): Promise<DoctorCheck[]> {
  const fetcher = deps.fetchImpl ?? fetch;
  const hasModel = (models: readonly string[], wanted: string): boolean =>
    models.some((name) => name === wanted || name.split(":")[0] === wanted.split(":")[0]);
  try {
    const response = await fetcher(`${deps.ollamaBaseUrl.replace(/\/+$/, "")}/api/tags`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { models?: { name: string }[] };
    const models = (body.models ?? []).map((m) => m.name);
    const modelCheck = (id: string, label: string, wanted: string): DoctorCheck =>
      hasModel(models, wanted)
        ? { id, label, status: "ok", detail: wanted }
        : {
            id, label, status: "fail",
            detail: `Modell "${wanted}" fehlt — installieren mit: ollama pull ${wanted}`,
          };
    return [
      { id: "ollama", label: "Ollama erreichbar", status: "ok", detail: `${models.length} Modelle installiert` },
      modelCheck("ollama-model", "Analyse-Modell", deps.ollamaModel),
      modelCheck("ollama-embedding", "Embedding-Modell", deps.ollamaEmbeddingModel),
    ];
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return [{
      id: "ollama", label: "Ollama erreichbar", status: "fail",
      detail: `${detail} — OLLAMA_URL in der .env prüfen`,
    }];
  }
}

export async function runDoctor(deps: WebUiDeps): Promise<{ checks: DoctorCheck[] }> {
  const checks: DoctorCheck[] = [
    ...(await checkPaperless(deps)),
    ...(await checkOllama(deps)),
  ];
  const vectors = deps.vectorStore.count();
  checks.push(
    vectors > 0
      ? { id: "vectors", label: "Suchindex", status: "ok", detail: `${vectors} Dokumente indexiert` }
      : {
          id: "vectors", label: "Suchindex", status: "warn",
          detail: "Noch leer — die semantische Suche indexiert Dokumente beim ersten Zugriff",
        },
  );
  const stored = loadStoredConfig(cfgPath(deps));
  let datevDetail: DoctorCheck;
  try {
    const resolved = resolveDatevConfig(stored);
    datevDetail = resolved
      ? {
          id: "datev", label: "DATEV-Konfiguration", status: "ok",
          detail: `Berater ${resolved.consultantNumber}, Mandant ${resolved.clientNumber}, ${resolved.skr}`,
        }
      : {
          id: "datev", label: "DATEV-Konfiguration", status: "warn",
          detail: "Noch nicht eingerichtet — Reiter „DATEV-Einstellungen“ ausfüllen",
        };
  } catch (error) {
    datevDetail = {
      id: "datev", label: "DATEV-Konfiguration", status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  checks.push(datevDetail);
  return { checks };
}

// ---------------------------------------------------------------------------
// Documents, preview, export
// ---------------------------------------------------------------------------

function parseRange(from: unknown, to: unknown): { from: string; to: string } {
  const range = z.object({ from: isoDate, to: isoDate }).parse({ from, to });
  if (range.from > range.to) {
    throw new Error("„Von“ liegt nach „Bis“ — Zeitraum prüfen");
  }
  return range;
}

export async function listDocuments(
  deps: WebUiDeps,
  fromRaw: unknown,
  toRaw: unknown,
): Promise<Record<string, unknown>> {
  const { from, to } = parseRange(fromRaw, toRaw);
  const stored = loadStoredConfig(cfgPath(deps));
  const documents = await deps.service.listReceiptDocuments(stored.receiptTag, from, to);
  return {
    receiptTag: stored.receiptTag,
    documents,
    uncachedIds: documents.filter((d) => !d.cached).map((d) => d.id),
  };
}

function requireDatevConfig(deps: WebUiDeps): NonNullable<ReturnType<typeof resolveDatevConfig>> {
  const resolved = resolveDatevConfig(loadStoredConfig(cfgPath(deps)));
  if (!resolved) {
    throw new Error(
      "DATEV ist noch nicht eingerichtet. Bitte zuerst den Reiter „DATEV-Einstellungen“ ausfüllen und speichern.",
    );
  }
  return resolved;
}

export async function previewBookings(
  deps: WebUiDeps,
  fromRaw: unknown,
  toRaw: unknown,
): Promise<Record<string, unknown>> {
  const { from, to } = parseRange(fromRaw, toRaw);
  const config = requireDatevConfig(deps);
  const stored = loadStoredConfig(cfgPath(deps));
  const documents = await deps.service.listReceiptDocuments(stored.receiptTag, from, to);

  const bookings: BookingPreview[] = [];
  const skipped: { documentId: number; reason: string }[] = [];
  const uncachedIds: number[] = [];
  for (const doc of documents) {
    const cached = deps.cache.get(doc.id);
    if (!cached) {
      uncachedIds.push(doc.id);
      continue;
    }
    try {
      bookings.push(mapReceiptToBooking(cached, config));
    } catch (error) {
      skipped.push({
        documentId: doc.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { bookings, skipped, uncachedIds, total: documents.length };
}

export async function buildExport(
  deps: WebUiDeps,
  fromRaw: unknown,
  toRaw: unknown,
  excludeRaw: unknown,
): Promise<Record<string, unknown>> {
  const { from, to } = parseRange(fromRaw, toRaw);
  const exclude = new Set(z.array(z.number().int()).default([]).parse(excludeRaw ?? []));
  const config = requireDatevConfig(deps);
  const stored = loadStoredConfig(cfgPath(deps));
  const documents = await deps.service.listReceiptDocuments(stored.receiptTag, from, to);

  const receipts = documents
    .filter((doc) => !exclude.has(doc.id))
    .map((doc) => deps.cache.get(doc.id))
    .filter((cached): cached is NonNullable<typeof cached> => cached !== null);
  if (receipts.length === 0) {
    throw new Error(
      "Keine analysierten Belege im Zeitraum. Erst „Jetzt analysieren“ ausführen.",
    );
  }

  const result = runDatevExport(receipts, config);
  mkdirSync(deps.exportDir, { recursive: true });
  const files = result.batches.map((batch) => {
    writeFileSync(join(deps.exportDir, batch.filename), batch.file);
    return {
      name: batch.filename,
      bookings: batch.bookings.length,
      bytes: batch.file.length,
    };
  });
  return {
    report: formatRunReport(result),
    files,
    skipped: result.skipped,
    exportedCount: result.exportedCount,
  };
}

/** Serve a previously generated export file; name is strictly validated. */
export function readExportFile(
  deps: WebUiDeps,
  name: unknown,
): { name: string; content: Buffer } | null {
  if (typeof name !== "string" || !EXPORT_FILENAME.test(name)) return null;
  try {
    return { name, content: readFileSync(join(deps.exportDir, name)) };
  } catch {
    return null;
  }
}
