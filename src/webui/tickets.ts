/**
 * Single-use download tickets.
 *
 * Browsers cannot attach headers to <a download> navigation, and putting
 * the persistent access code into the URL would leak it into history and
 * proxy logs. Instead the page requests a short-lived, single-use ticket
 * (authenticated via header) and the download URL carries only that
 * opaque ticket.
 */

import { randomBytes } from "crypto";

const TICKET_TTL_MS = 60_000;
const MAX_PENDING = 100;

export interface TicketStore {
  /** Issue a ticket for one export filename. */
  issue(filename: string): string;
  /** Redeem a ticket exactly once; returns the filename or null. */
  consume(ticket: string): string | null;
}

export function createTicketStore(
  ttlMs: number = TICKET_TTL_MS,
  now: () => number = Date.now,
): TicketStore {
  const pending = new Map<string, { filename: string; expiresAt: number }>();

  function evictExpired(): void {
    for (const [id, entry] of pending) {
      if (entry.expiresAt <= now()) pending.delete(id);
    }
  }

  return {
    issue(filename) {
      evictExpired();
      // Bounded: a stuck client must not grow this map forever.
      while (pending.size >= MAX_PENDING) {
        const oldest = pending.keys().next().value;
        if (oldest === undefined) break;
        pending.delete(oldest);
      }
      const id = randomBytes(24).toString("hex");
      pending.set(id, { filename, expiresAt: now() + ttlMs });
      return id;
    },

    consume(ticket) {
      evictExpired();
      const entry = pending.get(ticket);
      if (!entry) return null;
      pending.delete(ticket);
      return entry.filename;
    },
  };
}
