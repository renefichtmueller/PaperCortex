/**
 * Web UI HTTP server: serves the settings page and the JSON API.
 *
 * Hardening, in plain terms:
 * - Host-header allowlist: only localhost by default (WEBUI_ALLOWED_HOSTS
 *   extends it) — this is the DNS-rebinding defense, without it any website
 *   could script requests against a rebound "same-origin" localhost.
 * - Optional access code (WEBUI_TOKEN) checked constant-time, header-only;
 *   it never appears in URLs. Downloads use single-use tickets instead,
 *   because <a download> cannot carry headers.
 * - Without a token the UI is open to whoever reaches the port, so the
 *   shipped compose binds it to 127.0.0.1. Do not expose it to the internet.
 */

import { timingSafeEqual } from "crypto";
import * as http from "http";

import {
  buildExport,
  getSettings,
  listDocuments,
  previewBookings,
  readExportFile,
  runDoctor,
  saveSettings,
  type WebUiDeps,
} from "./api.js";
import { createIndexJob, type IndexJob } from "./indexer.js";
import { createAnalyzeJobs, type AnalyzeJobs } from "./jobs.js";
import { PAGE_HTML } from "./page.js";
import { createTicketStore, type TicketStore } from "./tickets.js";

const BODY_LIMIT_BYTES = 64 * 1024;
const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

export interface WebUiServerConfig {
  readonly deps: WebUiDeps;
  readonly token?: string;
  /** Extra Host values (LAN name/IP) allowed to reach the UI. */
  readonly allowedHosts?: readonly string[];
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** DNS-rebinding defense: the Host header must name an allowed host. */
export function isAllowedHost(
  hostHeader: string | undefined,
  extraHosts: readonly string[],
): boolean {
  if (!hostHeader) return false;
  const host = hostHeader
    .replace(/:\d+$/, "")
    .trim()
    .toLowerCase();
  return [...DEFAULT_ALLOWED_HOSTS, ...extraHosts.map((h) => h.toLowerCase())].includes(host);
}

function isAuthorized(req: http.IncomingMessage, token?: string): boolean {
  if (!token) return true;
  const presented = req.headers["x-auth-token"];
  return typeof presented === "string" && constantTimeEquals(presented, token);
}

async function route(
  config: WebUiServerConfig,
  jobs: AnalyzeJobs,
  indexJob: IndexJob,
  tickets: TicketStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const key = `${req.method} ${url.pathname}`;
  const { deps } = config;

  if (!isAllowedHost(req.headers.host, config.allowedHosts ?? [])) {
    return sendJson(res, 403, {
      error:
        "Host nicht erlaubt. Für Zugriff über einen LAN-Namen/IP diesen in WEBUI_ALLOWED_HOSTS eintragen (z. B. WEBUI_ALLOWED_HOSTS=unraid.local,192.168.1.50).",
    });
  }
  if (key === "GET /api/health") {
    return sendJson(res, 200, { status: "ok", service: "PaperCortex Web UI" });
  }

  // Downloads authenticate via single-use ticket (issued below with auth):
  // <a download> cannot send headers, and the access code must never
  // appear in a URL.
  if (key === "GET /api/file") {
    const filename = tickets.consume(url.searchParams.get("ticket") ?? "");
    const file = filename === null ? null : readExportFile(deps, filename);
    if (!file) {
      return sendJson(res, 404, {
        error: "Download abgelaufen — bitte „DATEV-Datei erstellen“ erneut anklicken",
      });
    }
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=windows-1252",
      "Content-Disposition": `attachment; filename="${file.name}"`,
      "Cache-Control": "no-store",
    });
    return void res.end(file.content);
  }

  if (!isAuthorized(req, config.token)) {
    return sendJson(res, 401, { error: "Zugangscode fehlt oder ist falsch" });
  }

  switch (key) {
    case "GET /": {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:",
      });
      return void res.end(PAGE_HTML);
    }
    case "GET /api/settings":
      return sendJson(res, 200, getSettings(deps));
    case "PUT /api/settings": {
      const result = saveSettings(deps, await readJsonBody(req));
      return sendJson(res, result.ok ? 200 : 400, result);
    }
    case "GET /api/doctor":
      return sendJson(res, 200, await runDoctor(deps));
    case "GET /api/documents":
      return sendJson(
        res,
        200,
        await listDocuments(deps, url.searchParams.get("from"), url.searchParams.get("to")),
      );
    case "POST /api/analyze": {
      const body = (await readJsonBody(req)) as {
        documentIds?: number[];
        refresh?: boolean;
      };
      const ids = Array.isArray(body.documentIds) ? body.documentIds : [];
      const started = jobs.start(ids, body.refresh === true);
      return sendJson(res, started ? 202 : 409, {
        started,
        ...(started ? {} : { error: "Es läuft bereits eine Analyse" }),
      });
    }
    case "GET /api/job":
      return sendJson(res, 200, jobs.status());
    case "POST /api/index": {
      const body = (await readJsonBody(req)) as { refresh?: boolean };
      const started = indexJob.start(body.refresh === true);
      return sendJson(res, started ? 202 : 409, {
        started,
        ...(started ? {} : { error: "Es läuft bereits eine Indexierung" }),
      });
    }
    case "GET /api/index-job":
      return sendJson(res, 200, indexJob.status());
    case "GET /api/preview":
      return sendJson(
        res,
        200,
        await previewBookings(deps, url.searchParams.get("from"), url.searchParams.get("to")),
      );
    case "POST /api/export": {
      const body = (await readJsonBody(req)) as {
        from?: string;
        to?: string;
        excludeIds?: number[];
      };
      return sendJson(res, 200, await buildExport(deps, body.from, body.to, body.excludeIds));
    }
    case "POST /api/file/ticket": {
      const body = (await readJsonBody(req)) as { name?: string };
      // readExportFile validates the name against the strict allowlist and
      // confirms the file exists before a ticket is handed out.
      const file = readExportFile(deps, body.name);
      if (!file) return sendJson(res, 404, { error: "Datei nicht gefunden" });
      return sendJson(res, 200, { ticket: tickets.issue(file.name) });
    }
    default:
      return sendJson(res, 404, { error: "Not found" });
  }
}

export function createWebUiServer(config: WebUiServerConfig): http.Server {
  const jobs = createAnalyzeJobs(config.deps.service);
  const indexJob = createIndexJob(config.deps);
  const tickets = createTicketStore();
  return http.createServer((req, res) => {
    route(config, jobs, indexJob, tickets, req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) sendJson(res, 400, { error: message });
      else res.end();
    });
  });
}
