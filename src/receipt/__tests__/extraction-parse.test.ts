import { describe, expect, it } from "vitest";

import {
  extractJsonObject,
  parseExtractionResponse,
} from "../extraction-parse.js";

describe("extractJsonObject", () => {
  it("parses plain JSON", () => {
    expect(extractJsonObject('{"vendor":"Rewe"}')).toEqual({ vendor: "Rewe" });
  });

  it("strips markdown fences and surrounding prose", () => {
    const text = 'Here is the extracted data:\n```json\n{"vendor":"Rewe","totalAmount":12.5}\n```\nLet me know!';
    expect(extractJsonObject(text)).toEqual({ vendor: "Rewe", totalAmount: 12.5 });
  });

  it("handles braces inside strings and nested objects", () => {
    const text = 'noise {"vendor":"Kiosk {24}","meta":{"a":"}"}} trailing';
    expect(extractJsonObject(text)).toEqual({ vendor: "Kiosk {24}", meta: { a: "}" } });
  });

  it("returns null for arrays, prose, and broken JSON", () => {
    expect(extractJsonObject("[1,2,3]")).toBeNull();
    expect(extractJsonObject("Sorry, I cannot read this receipt.")).toBeNull();
    expect(extractJsonObject('{"vendor": "Rewe"')).toBeNull();
  });
});

describe("parseExtractionResponse", () => {
  it("fills documented defaults for missing or malformed fields", () => {
    const result = parseExtractionResponse('{"totalAmount":"19.99","confidence":2}');
    expect(result).not.toBeNull();
    expect(result?.vendor).toBe("Unknown");
    expect(result?.totalAmount).toBe(19.99);
    expect(result?.currency).toBe("EUR");
    expect(result?.confidence).toBe(0.5);
    expect(result?.lineItems).toEqual([]);
    expect(result?.taxRate).toBeNull();
  });

  it("keeps an unparseable date instead of inventing today", () => {
    const result = parseExtractionResponse('{"vendor":"X","date":"gestern","totalAmount":5}');
    expect(result?.date).toBe("gestern");
  });

  it("normalizes currency and tolerates junk line items", () => {
    const result = parseExtractionResponse(
      '{"vendor":"X","currency":"eur","lineItems":[{"description":"Brot","quantity":"2","unitPrice":1.5,"totalPrice":3,"taxRate":7},"junk"]}',
    );
    expect(result?.currency).toBe("EUR");
    expect(result?.lineItems).toHaveLength(2);
    expect(result?.lineItems[0]).toEqual({
      description: "Brot", quantity: 2, unitPrice: 1.5, totalPrice: 3, taxRate: 7,
    });
    expect(result?.lineItems[1].description).toBe("");
  });
});
