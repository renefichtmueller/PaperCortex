/**
 * DATEV configuration: schema, validation, and persistent storage.
 *
 * Settings are stored as JSON in the data directory (written by the web UI)
 * and can be overridden per key via DATEV_* environment variables, so both
 * click-through users and docker-compose power users are covered.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";

import { z } from "zod";

import { DEFAULT_CASH_ACCOUNT, DEFAULT_MONEY_ACCOUNT, type Skr } from "./accounts.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Validation mirrors DATEV's own field constraints so a bad value fails
 * HERE with a clear message instead of failing silently on import at the
 * tax advisor's side.
 */
export const datevConfigSchema = z.object({
  /** Beraternummer: assigned by DATEV, 1001..9999999. */
  consultantNumber: z
    .number({ invalid_type_error: "consultantNumber must be a number" })
    .int()
    .min(1001, "Beraternummer must be between 1001 and 9999999")
    .max(9_999_999, "Beraternummer must be between 1001 and 9999999"),
  /** Mandantennummer: 1..99999. */
  clientNumber: z
    .number({ invalid_type_error: "clientNumber must be a number" })
    .int()
    .min(1, "Mandantennummer must be between 1 and 99999")
    .max(99_999, "Mandantennummer must be between 1 and 99999"),
  /** Chart of accounts. Ask the tax advisor which one they use. */
  skr: z.enum(["SKR03", "SKR04"]),
  /** First month of the fiscal year (1 = January). */
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
  /** G/L account number length (Sachkontenlänge), 4..8 digits. */
  accountLength: z.number().int().min(4).max(8).default(4),
  /** Money/bank account used as offset account (Gegenkonto). */
  moneyAccount: z
    .string()
    .regex(/^\d{4,8}$/, "moneyAccount must be 4-8 digits")
    .optional(),
  /** Cash-box account for receipts paid bar (default per chart: 1000/1600). */
  cashAccount: z
    .string()
    .regex(/^\d{4,8}$/, "cashAccount must be 4-8 digits")
    .optional(),
  /** Offset account for card payments (default: the money account). */
  cardAccount: z
    .string()
    .regex(/^\d{4,8}$/, "cardAccount must be 4-8 digits")
    .optional(),
  /** Mark exported batches festgeschrieben (GoBD). Ask the tax advisor. */
  lockBookings: z.boolean().default(false),
  /** Tax rate assumed when the receipt does not state one. */
  defaultTaxRate: z.union([z.literal(19), z.literal(7), z.literal(0)]).default(19),
  /** Per-category account overrides, e.g. { travel: "4670" }. */
  accountOverrides: z.record(z.string().regex(/^\d{4,8}$/)).default({}),
});

export type DatevConfig = z.infer<typeof datevConfigSchema>;

/** Everything the web UI manages, DATEV block optional until configured. */
export const storedConfigSchema = z.object({
  datev: datevConfigSchema.optional(),
  /** Paperless tag whose documents count as receipts for export. */
  receiptTag: z.string().min(1).default("receipt"),
});

export type StoredConfig = z.infer<typeof storedConfigSchema>;

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export function configFilePath(): string {
  const dataDir = process.env["PAPERCORTEX_DATA_DIR"] ?? "./data";
  return join(dataDir, "config.json");
}

/**
 * Load stored settings; a missing or unreadable file yields the defaults so
 * a fresh install always starts, never crashes.
 */
export function loadStoredConfig(path: string = configFilePath()): StoredConfig {
  let raw: unknown = {};
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // First start or corrupt file: fall through to defaults.
  }
  const parsed = storedConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : storedConfigSchema.parse({});
}

/** Atomically persist settings (write temp file, then rename). */
export function saveStoredConfig(
  config: StoredConfig,
  path: string = configFilePath(),
): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

// ---------------------------------------------------------------------------
// Environment overrides
// ---------------------------------------------------------------------------

const ENV_KEYS: Record<string, { field: string; kind: "string" | "number" | "boolean" }> = {
  DATEV_CONSULTANT_NUMBER: { field: "consultantNumber", kind: "number" },
  DATEV_CLIENT_NUMBER: { field: "clientNumber", kind: "number" },
  DATEV_SKR: { field: "skr", kind: "string" },
  DATEV_FISCAL_YEAR_START_MONTH: { field: "fiscalYearStartMonth", kind: "number" },
  DATEV_ACCOUNT_LENGTH: { field: "accountLength", kind: "number" },
  DATEV_MONEY_ACCOUNT: { field: "moneyAccount", kind: "string" },
  DATEV_CASH_ACCOUNT: { field: "cashAccount", kind: "string" },
  DATEV_CARD_ACCOUNT: { field: "cardAccount", kind: "string" },
  DATEV_LOCK_BOOKINGS: { field: "lockBookings", kind: "boolean" },
  DATEV_DEFAULT_TAX_RATE: { field: "defaultTaxRate", kind: "number" },
};

/**
 * Merge stored DATEV settings with DATEV_* environment overrides and
 * validate the result. Returns null when nothing is configured yet, so
 * callers can show the "please configure first" state instead of exporting
 * garbage with consultant number 0.
 */
export function resolveDatevConfig(
  stored: StoredConfig,
  env: NodeJS.ProcessEnv = process.env,
): DatevConfig | null {
  const merged: Record<string, unknown> = { ...(stored.datev ?? {}) };
  for (const [envKey, { field, kind }] of Object.entries(ENV_KEYS)) {
    const value = env[envKey];
    if (value === undefined || value === "") continue;
    merged[field] =
      kind === "number" ? Number(value)
      : kind === "boolean" ? ["1", "true", "yes"].includes(value.toLowerCase())
      : value;
  }
  if (Object.keys(merged).length === 0) return null;

  const parsed = datevConfigSchema.parse(merged);
  return {
    ...parsed,
    moneyAccount: parsed.moneyAccount ?? DEFAULT_MONEY_ACCOUNT[parsed.skr as Skr],
    cashAccount: parsed.cashAccount ?? DEFAULT_CASH_ACCOUNT[parsed.skr as Skr],
    cardAccount: parsed.cardAccount ?? parsed.moneyAccount ?? DEFAULT_MONEY_ACCOUNT[parsed.skr as Skr],
  };
}
