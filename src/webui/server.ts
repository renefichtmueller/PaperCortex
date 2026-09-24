/**
 * Web UI HTTP server: serves the settings page and the JSON API.
 *
 * Designed for the home lab / LAN. An optional shared secret (WEBUI_TOKEN)
 * gates every request; the page itself asks for it once and remembers it.
 * Do not expose this port to the public internet.
 */

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
import { createAnalyzeJobs, type AnalyzeJobs } from "./jobs.js";
import { PAGE_HTML } from "./page.js";

const BODY_LIMIT_BYTES = 64 * 1024;

export interface WebUiServerConfig {
  readonly deps: WebUiDeps;
  readonly token?: string;
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

function isAuthorized(req: http.IncomingMessage, url: URL, token?: string): boolean {
  if (!token) return true;
  return req.headers["x-auth-token"] === token || url.searchParams.get("token") === token;
}

async function route(
  config: WebUiServerConfig,
  jobs: AnalyzeJobs,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const key = `${req.method} ${url.pathname}`;
  const { deps } = config;

  if (key === "GET /api/health") {
    return sendJson(res, 200, { status: "ok", service: "PaperCortex Web UI" });
  }
  if (!isAuthorized(req, url, config.token)) {
    return sendJson(res, 401, { error: "Zugangstoken fehlt oder ist falsch" });
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
    case "GET /api/file": {
      const file = readExportFile(deps, url.searchParams.get("name"));
      if (!file) return sendJson(res, 404, { error: "Datei nicht gefunden" });
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=windows-1252",
        "Content-Disposition": `attachment; filename="${file.name}"`,
        "Cache-Control": "no-store",
      });
      return void res.end(file.content);
    }
    default:
      return sendJson(res, 404, { error: "Not found" });
  }
}

export function createWebUiServer(config: WebUiServerConfig): http.Server {
  const jobs = createAnalyzeJobs(config.deps.service);
  return http.createServer((req, res) => {
    route(config, jobs, req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) sendJson(res, 400, { error: message });
      else res.end();
    });
  });
}
