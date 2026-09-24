import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";

import { afterAll, describe, expect, it } from "vitest";

import type { ReceiptCache } from "../../datev/receipt-cache.js";
import type { DatevService } from "../../datev/service.js";
import type { WebUiDeps } from "../api.js";
import { createWebUiServer, isAllowedHost } from "../server.js";

const DIR = mkdtempSync(join(tmpdir(), "pcx-server-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

const FILE_NAME = "EXTF_Buchungsstapel_20260901_20260930.csv";

function deps(): WebUiDeps {
  const exportDir = join(DIR, "exports");
  mkdirSync(exportDir, { recursive: true });
  writeFileSync(join(exportDir, FILE_NAME), "EXTF;700\r\n");
  return {
    paperless: {} as WebUiDeps["paperless"],
    service: { listReceiptDocuments: async () => [], collectReceipts: async () => ({ receipts: [], failures: [] }) } as DatevService,
    cache: { get: () => null, set: () => undefined, remove: () => undefined, close: () => undefined } as ReceiptCache,
    vectorStore: { count: () => 0, has: () => false, upsert: () => undefined },
    embed: async () => ({ vector: [0.1] }),
    ollamaBaseUrl: "http://ollama.test",
    ollamaModel: "m",
    ollamaEmbeddingModel: "e",
    exportDir,
    configPath: join(DIR, "config.json"),
  };
}

async function withServer(
  token: string | undefined,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const server = createWebUiServer({ deps: deps(), token, allowedHosts: ["lan.test"] });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("host allowlist (DNS-rebinding defense)", () => {
  it("accepts localhost variants and configured hosts, rejects the rest", () => {
    expect(isAllowedHost("localhost:8140", [])).toBe(true);
    expect(isAllowedHost("127.0.0.1", [])).toBe(true);
    expect(isAllowedHost("unraid.local:8140", ["unraid.local"])).toBe(true);
    expect(isAllowedHost("evil.example.com", ["unraid.local"])).toBe(false);
    expect(isAllowedHost(undefined, [])).toBe(false);
  });

  it("returns 403 with a how-to-fix hint for foreign Host headers", async () => {
    // fetch() refuses to override Host, so this rebinding simulation uses
    // the raw http client.
    const { request } = await import("http");
    await withServer(undefined, async (base) => {
      const { port } = new URL(base);
      const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request(
          { host: "127.0.0.1", port, path: "/api/settings", headers: { Host: "attacker.example" } },
          (res) => {
            let body = "";
            res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
            res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
          },
        );
        req.on("error", reject);
        req.end();
      });
      expect(result.status).toBe(403);
      expect(result.body).toContain("WEBUI_ALLOWED_HOSTS");
    });
  });
});

describe("access code", () => {
  it("rejects missing or wrong codes and accepts the header-only code", async () => {
    await withServer("geheim-1234", async (base) => {
      expect((await fetch(`${base}/api/settings`)).status).toBe(401);
      expect(
        (await fetch(`${base}/api/settings`, { headers: { "X-Auth-Token": "falsch" } })).status,
      ).toBe(401);
      expect(
        (await fetch(`${base}/api/settings`, { headers: { "X-Auth-Token": "geheim-1234" } }))
          .status,
      ).toBe(200);
    });
  });
});

describe("ticket downloads", () => {
  it("issues a ticket with auth and serves the file exactly once", async () => {
    await withServer("geheim-1234", async (base) => {
      const auth = { "X-Auth-Token": "geheim-1234", "Content-Type": "application/json" };
      const noTicket = await fetch(`${base}/api/file/ticket`, {
        method: "POST", body: JSON.stringify({ name: FILE_NAME }),
      });
      expect(noTicket.status).toBe(401);

      const issued = await fetch(`${base}/api/file/ticket`, {
        method: "POST", headers: auth, body: JSON.stringify({ name: FILE_NAME }),
      });
      expect(issued.status).toBe(200);
      const { ticket } = (await issued.json()) as { ticket: string };

      const download = await fetch(`${base}/api/file?ticket=${ticket}`);
      expect(download.status).toBe(200);
      expect(await download.text()).toContain("EXTF;700");

      const replay = await fetch(`${base}/api/file?ticket=${ticket}`);
      expect(replay.status).toBe(404);
    });
  });

  it("refuses tickets for unknown filenames", async () => {
    await withServer(undefined, async (base) => {
      const res = await fetch(`${base}/api/file/ticket`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "../../../etc/passwd" }),
      });
      expect(res.status).toBe(404);
    });
  });
});
