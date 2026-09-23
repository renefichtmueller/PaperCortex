/**
 * DATEV command line: the three commands a non-technical user needs.
 *
 *   npm run datev:init     -- interactive wizard, writes data/config.json
 *   npm run datev:check    -- dry run: shows what WOULD be exported and why not
 *   npm run datev:export   -- writes ready-to-import EXTF file(s)
 *
 * Selection for check/export:
 *   --month 2026-08            one calendar month
 *   --from 2026-01-01 --to …   explicit range
 *   --tag Beleg                override the configured receipt tag
 *   --ids 12,34,56             explicit document IDs (skips tag search)
 *   --refresh                  ignore the extraction cache
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

import { config as loadDotenv } from "dotenv";

import { createOllamaClient } from "../embeddings/ollama.js";
import { createPaperlessClient } from "../paperless/client.js";
import { DEFAULT_MONEY_ACCOUNT, type Skr } from "../datev/accounts.js";
import {
  configFilePath,
  datevConfigSchema,
  loadStoredConfig,
  resolveDatevConfig,
  saveStoredConfig,
  type DatevConfig,
} from "../datev/config.js";
import { formatRunReport, runDatevExport } from "../datev/export-run.js";
import { createReceiptCache } from "../datev/receipt-cache.js";
import { createDatevService, type DatevService } from "../datev/service.js";

loadDotenv();

const out = (line = ""): void => {
  process.stdout.write(line + "\n");
};

function exportDir(): string {
  return process.env["PAPERCORTEX_EXPORT_DIR"] ?? "./exports";
}

function describeConfig(config: DatevConfig): string {
  return (
    `Berater ${config.consultantNumber} · Mandant ${config.clientNumber} · ` +
    `${config.skr} · Wirtschaftsjahr ab Monat ${config.fiscalYearStartMonth} · ` +
    `Geldkonto ${config.moneyAccount}`
  );
}

const NOT_CONFIGURED =
  "DATEV ist noch nicht eingerichtet. / DATEV is not configured yet.\n" +
  'Einmalig ausfuehren / run once:  npm run datev:init';

// ---------------------------------------------------------------------------
// Wizard (datev:init)
// ---------------------------------------------------------------------------

interface WizardField {
  readonly prompt: string;
  readonly error: string;
  readonly parse: (raw: string) => unknown | null;
  readonly defaultValue?: () => string;
}

interface LineReader {
  readonly next: (prompt: string) => Promise<string>;
  readonly close: () => void;
}

/**
 * Buffered line reader: `readline.question()` drops lines that arrive
 * between two awaits, so pasting all answers at once (or piping them in
 * a Docker exec) would silently skip questions. This queues every line.
 */
function createLineReader(): LineReader {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const queue: string[] = [];
  const waiters: Array<(line: string | null) => void> = [];
  let closed = false;
  rl.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else queue.push(line);
  });
  rl.on("close", () => {
    closed = true;
    while (waiters.length > 0) waiters.shift()!(null);
  });
  return {
    next(prompt) {
      process.stdout.write(prompt);
      const buffered = queue.shift();
      if (buffered !== undefined) return Promise.resolve(buffered);
      if (closed) {
        return Promise.reject(
          new Error("Eingabe beendet, Einrichtung abgebrochen. / Input ended, setup aborted."),
        );
      }
      return new Promise((resolve, reject) => {
        waiters.push((line) => {
          if (line === null) {
            reject(
              new Error(
                "Eingabe beendet, Einrichtung abgebrochen. / Input ended, setup aborted.",
              ),
            );
          } else {
            resolve(line);
          }
        });
      });
    },
    close: () => rl.close(),
  };
}

/** Accepts "3", "03", "skr03", "SKR 03" and normalizes to SKR03/SKR04. */
export function normalizeSkr(value: string): string {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits === "3" || digits === "03") return "SKR03";
  if (digits === "4" || digits === "04") return "SKR04";
  return value.trim().toUpperCase();
}

function numberField(schema: { safeParse: (v: unknown) => { success: boolean } }) {
  return (raw: string): unknown | null => {
    const value = Number(raw);
    return Number.isFinite(value) && schema.safeParse(value).success ? value : null;
  };
}

async function ask(reader: LineReader, field: WizardField): Promise<unknown> {
  for (;;) {
    const fallback = field.defaultValue?.();
    const suffix = fallback !== undefined ? ` [Enter = ${fallback}]` : "";
    const raw = (await reader.next(`${field.prompt}${suffix}\n> `)).trim() || fallback || "";
    const value = field.parse(raw);
    if (value !== null) return value;
    out(`  ✗ ${field.error}\n`);
  }
}

async function runInit(): Promise<void> {
  out("");
  out("DATEV-Einrichtung / DATEV setup");
  out("--------------------------------");
  out("Du brauchst drei Angaben von deinem Steuerberater / you need three");
  out("values from your tax advisor: Beraternummer, Mandantennummer, SKR.");
  out("");

  const reader = createLineReader();
  const shape = datevConfigSchema.shape;

  const consultantNumber = await ask(reader, {
    prompt: "1/6  Beraternummer (consultant number)?",
    error:
      "Die Beraternummer ist eine Zahl zwischen 1001 und 9999999. / A number between 1001 and 9999999.",
    parse: numberField(shape.consultantNumber),
  });
  const clientNumber = await ask(reader, {
    prompt: "2/6  Mandantennummer (client number)?",
    error:
      "Die Mandantennummer ist eine Zahl zwischen 1 und 99999. / A number between 1 and 99999.",
    parse: numberField(shape.clientNumber),
  });
  const skr = await ask(reader, {
    prompt: "3/6  Kontenrahmen SKR03 oder SKR04? (chart of accounts)",
    error:
      'Bitte "SKR03" oder "SKR04" angeben -- im Zweifel den Steuerberater fragen. / Enter "SKR03" or "SKR04".',
    parse: (raw) => {
      const normalized = normalizeSkr(raw);
      return shape.skr.safeParse(normalized).success ? normalized : null;
    },
    defaultValue: () => "SKR03",
  });
  const fiscalYearStartMonth = await ask(reader, {
    prompt: "4/6  Erster Monat des Wirtschaftsjahres? (1 = Januar)",
    error: "Eine Zahl von 1 bis 12. / A number from 1 to 12.",
    parse: numberField(shape.fiscalYearStartMonth),
    defaultValue: () => "1",
  });
  const moneyAccount = await ask(reader, {
    prompt: "5/6  Geldkonto fuer die Gegenbuchung? (bank account)",
    error:
      "Eine Kontonummer mit 4 bis 8 Ziffern, z. B. 1200 (SKR03) oder 1800 (SKR04).",
    parse: (raw) => (shape.moneyAccount.safeParse(raw).success ? raw : null),
    defaultValue: () => DEFAULT_MONEY_ACCOUNT[skr as Skr],
  });
  const receiptTag = await ask(reader, {
    prompt: '6/6  Paperless-Tag fuer Belege? (receipt tag)',
    error: "Der Tag-Name darf nicht leer sein. / The tag name must not be empty.",
    parse: (raw) => (raw.trim() === "" ? null : raw.trim()),
    defaultValue: () => loadStoredConfig().receiptTag,
  });
  reader.close();

  const stored = loadStoredConfig();
  const datev = datevConfigSchema.parse({
    consultantNumber,
    clientNumber,
    skr,
    fiscalYearStartMonth,
    moneyAccount,
  });
  saveStoredConfig({ ...stored, datev, receiptTag: receiptTag as string });

  out("");
  out(`✓ Gespeichert in ${configFilePath()}`);
  out(`  ${describeConfig(datev)} · Beleg-Tag "${receiptTag as string}"`);
  out("");
  out(`Naechster Schritt / next step:  npm run datev:check -- --month ${currentMonth()}`);
}

// ---------------------------------------------------------------------------
// Selection arguments
// ---------------------------------------------------------------------------

export interface CliArgs {
  readonly ids?: readonly number[];
  readonly tag?: string;
  readonly from?: string;
  readonly to?: string;
  readonly refresh: boolean;
}

export function parseCliArgs(argv: readonly string[]): CliArgs | { error: string } {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const month = get("--month");
  let from = get("--from");
  let to = get("--to");
  if (month !== undefined) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return { error: `--month erwartet JJJJ-MM, z. B. --month ${currentMonth()}` };
    }
    const [year, mm] = month.split("-").map(Number) as [number, number];
    from = `${month}-01`;
    to = new Date(Date.UTC(year, mm, 0)).toISOString().slice(0, 10);
  }
  for (const [flag, value] of [["--from", from], ["--to", to]] as const) {
    if (value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { error: `${flag} erwartet JJJJ-MM-TT, bekommen: "${value}"` };
    }
  }
  const idsRaw = get("--ids");
  const ids = idsRaw
    ?.split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  return { ids, tag: get("--tag"), from, to, refresh: argv.includes("--refresh") };
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------
// check / export
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `${key} fehlt in der .env -- siehe docs/setup.md fuer die Paperless-Verbindung.`,
    );
  }
  return value;
}

function createService(): { service: DatevService; close: () => void } {
  const paperless = createPaperlessClient({
    baseUrl: requireEnv("PAPERLESS_URL"),
    token: requireEnv("PAPERLESS_TOKEN"),
  });
  const ollama = createOllamaClient({
    baseUrl: process.env["OLLAMA_URL"] ?? "http://localhost:11434",
    model: process.env["OLLAMA_MODEL"] ?? "qwen2.5:14b",
    embeddingModel: process.env["OLLAMA_EMBEDDING_MODEL"] ?? "nomic-embed-text",
  });
  const dataDir = process.env["PAPERCORTEX_DATA_DIR"] ?? "./data";
  fs.mkdirSync(dataDir, { recursive: true });
  const cache = createReceiptCache(path.join(dataDir, "receipts.db"));
  const service = createDatevService({ paperless, ollama, cache });
  return { service, close: () => cache.close() };
}

async function runCheckOrExport(
  mode: "check" | "export",
  argv: readonly string[],
): Promise<void> {
  const args = parseCliArgs(argv);
  if ("error" in args) {
    out(`✗ ${args.error}`);
    process.exitCode = 1;
    return;
  }

  const stored = loadStoredConfig();
  const config = resolveDatevConfig(stored);
  if (config === null) {
    out(NOT_CONFIGURED);
    process.exitCode = 1;
    return;
  }
  out(`Konfiguration: ${describeConfig(config)}`);

  const { service, close } = createService();
  try {
    let ids: readonly number[];
    if (args.ids && args.ids.length > 0) {
      ids = args.ids;
    } else {
      const from = args.from ?? "1900-01-01";
      const to = args.to ?? "2999-12-31";
      const tag = args.tag ?? stored.receiptTag;
      const documents = await service.listReceiptDocuments(tag, from, to);
      ids = documents.map((d) => d.id);
      out(
        `${documents.length} Dokument(e) mit Tag "${tag}" im Zeitraum, ` +
          `davon ${documents.filter((d) => d.cached).length} bereits im Cache.`,
      );
    }
    if (ids.length === 0) {
      out("Keine Dokumente gefunden. Tag und Zeitraum pruefen (--tag, --month).");
      return;
    }

    out(`Extrahiere Belegdaten (${ids.length} Dokumente) ...`);
    const { receipts, failures } = await service.collectReceipts(ids, {
      refresh: args.refresh,
      onProgress: (done, total) => {
        if (done === total || done % 10 === 0) out(`  ... ${done}/${total}`);
      },
    });

    const result = runDatevExport(receipts, config);
    out("");
    out(formatRunReport(result));
    for (const failure of failures) {
      out(`  ✗ Beleg #${failure.documentId}: Extraktion fehlgeschlagen (${failure.error})`);
    }

    if (mode === "check") {
      out("");
      out("Probelauf -- es wurde nichts geschrieben. Export mit: npm run datev:export");
      return;
    }

    fs.mkdirSync(exportDir(), { recursive: true });
    for (const batch of result.batches) {
      const target = path.resolve(exportDir(), batch.filename);
      fs.writeFileSync(target, batch.file);
      out("");
      out(`Datei geschrieben: ${target}`);
    }
    if (result.batches.length > 0) {
      out("");
      out("Import beim Steuerberater / in DATEV Rechnungswesen:");
      out('  Bestand -> Importieren -> "DATEV-Format" -> Datei auswaehlen.');
      out("Details und Fehlerhilfe: docs/datev.md");
    }
  } finally {
    close();
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "init":
      return runInit();
    case "check":
      return runCheckOrExport("check", rest);
    case "export":
      return runCheckOrExport("export", rest);
    default:
      out("Verwendung / usage:");
      out("  npm run datev:init");
      out(`  npm run datev:check -- --month ${currentMonth()} [--tag Beleg] [--refresh]`);
      out(`  npm run datev:export -- --month ${currentMonth()} [--tag Beleg]`);
      out("  (alternativ --from JJJJ-MM-TT --to JJJJ-MM-TT oder --ids 1,2,3)");
      process.exitCode = command === undefined ? 0 : 1;
  }
}

const isDirectRun =
  process.argv[1]?.endsWith("cli/datev.ts") || process.argv[1]?.endsWith("cli/datev.js");
if (isDirectRun) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    out(`✗ ${message}`);
    process.exit(1);
  });
}
