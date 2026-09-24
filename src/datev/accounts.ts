/**
 * SKR03 / SKR04 chart-of-accounts mappings for expense categories.
 *
 * These are sensible defaults for small businesses. Every account can be
 * overridden per category in the DATEV settings, because tax advisors
 * frequently use client-specific accounts.
 */

export type Skr = "SKR03" | "SKR04";

/** Expense category → default account, per chart of accounts. */
const EXPENSE_ACCOUNTS: Record<Skr, Record<string, string>> = {
  SKR03: {
    office_supplies: "4930",
    travel: "4660",
    food: "4650",
    telephone: "4920",
    postage: "4910",
    insurance: "4360",
    rent: "4210",
    advertising: "4600",
    software: "4964",
    hardware: "4985",
    consulting: "4957",
    training: "4945",
    vehicle: "4500",
    default: "4900",
  },
  SKR04: {
    office_supplies: "6815",
    travel: "6650",
    food: "6640",
    telephone: "6805",
    postage: "6800",
    insurance: "6400",
    rent: "6310",
    advertising: "6600",
    software: "6837",
    hardware: "6845",
    consulting: "6825",
    training: "6821",
    vehicle: "6520",
    default: "6300",
  },
};

/** Default money (bank) account used as the offset account, per chart. */
export const DEFAULT_MONEY_ACCOUNT: Record<Skr, string> = {
  SKR03: "1200",
  SKR04: "1800",
};

/** Default cash-box account (Kasse) for receipts paid bar, per chart. */
export const DEFAULT_CASH_ACCOUNT: Record<Skr, string> = {
  SKR03: "1000",
  SKR04: "1600",
};

/** All category keys the extractor may produce, for UI display. */
export function knownCategories(): readonly string[] {
  return Object.keys(EXPENSE_ACCOUNTS.SKR03).filter((k) => k !== "default");
}

/**
 * Resolve the expense account for a category: per-category override first,
 * then the chart default, then the chart's catch-all account.
 */
export function resolveExpenseAccount(
  category: string | null,
  skr: Skr,
  overrides: Readonly<Record<string, string>> = {},
): { account: string; usedFallback: boolean } {
  const key = category ?? "default";
  const override = overrides[key];
  if (override) return { account: override, usedFallback: false };

  const mapped = EXPENSE_ACCOUNTS[skr][key];
  if (mapped) return { account: mapped, usedFallback: false };

  const fallback = overrides["default"] ?? EXPENSE_ACCOUNTS[skr]["default"];
  return { account: fallback, usedFallback: true };
}
