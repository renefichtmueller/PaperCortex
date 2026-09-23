import { describe, expect, it } from "vitest";

import { normalizeSkr, parseCliArgs } from "../datev.js";

describe("parseCliArgs", () => {
  it("expands --month into a from/to range including month end", () => {
    const args = parseCliArgs(["--month", "2026-02"]);
    if ("error" in args) throw new Error(args.error);
    expect(args.from).toBe("2026-02-01");
    expect(args.to).toBe("2026-02-28");
    expect(args.refresh).toBe(false);
  });

  it("handles leap years", () => {
    const args = parseCliArgs(["--month", "2028-02"]);
    if (!("error" in args)) expect(args.to).toBe("2028-02-29");
  });

  it("rejects malformed month and date values with usage hints", () => {
    expect(parseCliArgs(["--month", "Feb26"])).toHaveProperty("error");
    expect(parseCliArgs(["--from", "01.02.2026"])).toHaveProperty("error");
  });

  it("parses explicit document IDs and the refresh flag", () => {
    const args = parseCliArgs(["--ids", "12, 34,x,56", "--refresh"]);
    if ("error" in args) throw new Error(args.error);
    expect(args.ids).toEqual([12, 34, 56]);
    expect(args.refresh).toBe(true);
  });
});

describe("normalizeSkr", () => {
  it("normalizes sloppy chart-of-accounts input", () => {
    expect(normalizeSkr("SKR 03")).toBe("SKR03");
    expect(normalizeSkr("4")).toBe("SKR04");
    expect(normalizeSkr("skr04")).toBe("SKR04");
    expect(normalizeSkr("03")).toBe("SKR03");
  });
});
