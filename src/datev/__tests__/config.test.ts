import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, describe, expect, it } from "vitest";

import {
  datevConfigSchema,
  loadStoredConfig,
  resolveDatevConfig,
  saveStoredConfig,
  storedConfigSchema,
} from "../config.js";

const VALID = {
  consultantNumber: 29098,
  clientNumber: 55003,
  skr: "SKR03" as const,
};

describe("datevConfigSchema", () => {
  it("accepts a minimal valid configuration with defaults", () => {
    const parsed = datevConfigSchema.parse(VALID);
    expect(parsed.fiscalYearStartMonth).toBe(1);
    expect(parsed.accountLength).toBe(4);
    expect(parsed.defaultTaxRate).toBe(19);
  });

  it("rejects out-of-range consultant and client numbers", () => {
    expect(() => datevConfigSchema.parse({ ...VALID, consultantNumber: 5 })).toThrow(
      "Beraternummer",
    );
    expect(() => datevConfigSchema.parse({ ...VALID, clientNumber: 100000 })).toThrow(
      "Mandantennummer",
    );
  });

  it("rejects malformed account overrides", () => {
    expect(() =>
      datevConfigSchema.parse({ ...VALID, accountOverrides: { travel: "12" } }),
    ).toThrow();
  });
});

describe("stored config round-trip", () => {
  const dir = mkdtempSync(join(tmpdir(), "pcx-config-"));
  const path = join(dir, "nested", "config.json");

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("saves and reloads settings, and defaults on a missing file", () => {
    expect(loadStoredConfig(path).receiptTag).toBe("receipt");
    const config = storedConfigSchema.parse({ datev: VALID, receiptTag: "Beleg" });
    saveStoredConfig(config, path);
    const loaded = loadStoredConfig(path);
    expect(loaded.receiptTag).toBe("Beleg");
    expect(loaded.datev?.consultantNumber).toBe(29098);
  });
});

describe("resolveDatevConfig", () => {
  it("returns null when nothing is configured", () => {
    expect(resolveDatevConfig(storedConfigSchema.parse({}), {})).toBeNull();
  });

  it("fills the SKR-specific money account default", () => {
    const stored = storedConfigSchema.parse({ datev: { ...VALID, skr: "SKR04" } });
    expect(resolveDatevConfig(stored, {})?.moneyAccount).toBe("1800");
  });

  it("lets environment variables override stored values", () => {
    const stored = storedConfigSchema.parse({ datev: VALID });
    const resolved = resolveDatevConfig(stored, {
      DATEV_CLIENT_NUMBER: "777",
      DATEV_MONEY_ACCOUNT: "1210",
    });
    expect(resolved?.clientNumber).toBe(777);
    expect(resolved?.moneyAccount).toBe("1210");
    expect(resolved?.consultantNumber).toBe(29098);
  });

  it("rejects invalid environment values loudly", () => {
    const stored = storedConfigSchema.parse({ datev: VALID });
    expect(() => resolveDatevConfig(stored, { DATEV_SKR: "SKR99" })).toThrow();
  });
});
