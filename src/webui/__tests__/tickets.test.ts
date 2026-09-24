import { describe, expect, it } from "vitest";

import { createTicketStore } from "../tickets.js";

describe("download tickets", () => {
  it("redeems a ticket exactly once", () => {
    const store = createTicketStore();
    const ticket = store.issue("EXTF_Buchungsstapel_20260901_20260930.csv");
    expect(ticket).toMatch(/^[0-9a-f]{48}$/);
    expect(store.consume(ticket)).toBe("EXTF_Buchungsstapel_20260901_20260930.csv");
    expect(store.consume(ticket)).toBeNull();
  });

  it("rejects unknown and expired tickets", () => {
    let clock = 1000;
    const store = createTicketStore(500, () => clock);
    const ticket = store.issue("EXTF_Buchungsstapel_20260901_20260930.csv");
    expect(store.consume("deadbeef")).toBeNull();
    clock += 501;
    expect(store.consume(ticket)).toBeNull();
  });

  it("bounds the number of pending tickets", () => {
    const store = createTicketStore();
    const first = store.issue("EXTF_Buchungsstapel_20260101_20260131.csv");
    for (let i = 0; i < 120; i++) store.issue("EXTF_Buchungsstapel_20260201_20260228.csv");
    expect(store.consume(first)).toBeNull();
  });
});
