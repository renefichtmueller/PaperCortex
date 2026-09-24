/**
 * Web UI bootstrap shared by the MCP server process and the standalone
 * `npm run webui` entry: builds the DATEV service around existing clients
 * and starts the HTTP server.
 */

import { join } from "path";

import type { OllamaClient } from "../embeddings/ollama.js";
import type { PaperlessClient } from "../paperless/client.js";
import { createReceiptCache } from "../datev/receipt-cache.js";
import { createDatevService } from "../datev/service.js";
import { createWebUiServer } from "./server.js";
import type { WebUiDeps } from "./api.js";

export interface WebUiClients {
  readonly paperless: PaperlessClient;
  readonly ollama: OllamaClient;
  readonly vectorStore: { count(): number };
}

/**
 * Start the web UI unless WEBUI_ENABLED=false. Returns true when running.
 * Never throws: a broken UI must not take down the MCP server.
 */
export function maybeStartWebUi(clients: WebUiClients): boolean {
  if ((process.env["WEBUI_ENABLED"] ?? "true").toLowerCase() === "false") {
    return false;
  }
  const port = parseInt(process.env["WEBUI_PORT"] ?? "8140", 10);
  const dataDir = process.env["PAPERCORTEX_DATA_DIR"] ?? "./data";
  try {
    const cache = createReceiptCache(join(dataDir, "receipts.db"));
    const deps: WebUiDeps = {
      paperless: clients.paperless,
      service: createDatevService({
        paperless: clients.paperless,
        ollama: clients.ollama,
        cache,
      }),
      cache,
      vectorStore: clients.vectorStore,
      ollamaBaseUrl: process.env["OLLAMA_URL"] ?? "http://localhost:11434",
      ollamaModel: process.env["OLLAMA_MODEL"] ?? "qwen2.5:14b",
      ollamaEmbeddingModel:
        process.env["OLLAMA_EMBEDDING_MODEL"] ?? "nomic-embed-text",
      exportDir: process.env["PAPERCORTEX_EXPORT_DIR"] ?? "./exports",
    };
    const server = createWebUiServer({
      deps,
      token: process.env["WEBUI_TOKEN"] || undefined,
    });
    server.listen(port, () => {
      console.error(`PaperCortex Web UI: http://localhost:${port}`);
    });
    return true;
  } catch (error) {
    console.error(
      "Web UI failed to start (MCP server keeps running):",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
