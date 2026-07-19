/**
 * PaperCortex MCP Server entry point.
 *
 * Exposes document intelligence tools via the Model Context Protocol (MCP)
 * for integration with Claude Code and other AI agents.
 *
 * @see https://modelcontextprotocol.io
 */

import * as http from "http";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "dotenv";

import { createOllamaClient } from "../embeddings/ollama.js";
import { createVectorStore } from "../embeddings/store.js";
import { createPaperlessClient } from "../paperless/client.js";
import { handleClassify } from "./tools/classify.js";
import { handleExport } from "./tools/export.js";
import { handleQuery } from "./tools/query.js";
import { handleReceipt } from "./tools/receipt.js";
import { handleSearch } from "./tools/search.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

config(); // Load .env

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Service initialization
// ---------------------------------------------------------------------------

const paperless = createPaperlessClient({
  baseUrl: requireEnv("PAPERLESS_URL"),
  token: requireEnv("PAPERLESS_TOKEN"),
});

const ollama = createOllamaClient({
  baseUrl: process.env["OLLAMA_URL"] ?? "http://localhost:11434",
  model: process.env["OLLAMA_MODEL"] ?? "qwen2.5:14b",
  embeddingModel: process.env["OLLAMA_EMBEDDING_MODEL"] ?? "nomic-embed-text",
});

const vectorStore = createVectorStore({
  dbPath: process.env["VECTOR_DB_PATH"] ?? "./data/vectors.db",
});

// ---------------------------------------------------------------------------
// Shared context for tool handlers
// ---------------------------------------------------------------------------

export interface ToolContext {
  readonly paperless: typeof paperless;
  readonly ollama: typeof ollama;
  readonly vectorStore: typeof vectorStore;
}

const ctx: ToolContext = { paperless, ollama, vectorStore };

// ---------------------------------------------------------------------------
// MCP Server setup
//
// Builds a fresh Server instance per call. The SDK's Server.connect() can
// only ever be bound to one transport at a time (throws "Already connected
// to a transport" if called twice on the same instance) - since /sse serves
// one long-lived connection per client and multiple clients can connect
// concurrently, each connection needs its own Server, not a shared one.
// ---------------------------------------------------------------------------

function createMcpServer(): Server {
  const server = new Server(
    {
      name: "papercortex",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  /**
   * List all available PaperCortex tools.
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "papercortex_search",
      description:
        "Semantic search across all documents in Paperless-ngx. " +
        "Finds documents by meaning, not just keywords.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Natural language search query",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 10)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tag names",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "papercortex_classify",
      description:
        "Auto-classify a document using local AI. " +
        "Suggests tags, document type, and correspondent.",
      inputSchema: {
        type: "object" as const,
        properties: {
          documentId: {
            type: "number",
            description: "Paperless-ngx document ID",
          },
          applyTags: {
            type: "boolean",
            description: "Automatically apply suggested tags (default: false)",
          },
        },
        required: ["documentId"],
      },
    },
    {
      name: "papercortex_receipt",
      description:
        "Extract structured data from a receipt document: " +
        "vendor, date, amounts, tax, line items.",
      inputSchema: {
        type: "object" as const,
        properties: {
          documentId: {
            type: "number",
            description: "Paperless-ngx document ID of the receipt",
          },
        },
        required: ["documentId"],
      },
    },
    {
      name: "papercortex_query",
      description:
        "Ask natural language questions about your documents. " +
        'Example: "How much did I spend on office supplies in Q1 2024?"',
      inputSchema: {
        type: "object" as const,
        properties: {
          question: {
            type: "string",
            description: "Natural language question about your documents",
          },
          maxDocuments: {
            type: "number",
            description:
              "Maximum documents to include in context (default: 5)",
          },
        },
        required: ["question"],
      },
    },
    {
      name: "papercortex_export",
      description:
        "Export receipt data as DATEV-compatible CSV for German accounting, " +
        "or as generic CSV.",
      inputSchema: {
        type: "object" as const,
        properties: {
          documentIds: {
            type: "array",
            items: { type: "number" },
            description: "Document IDs to export",
          },
          format: {
            type: "string",
            enum: ["datev", "csv"],
            description: "Export format (default: datev)",
          },
        },
        required: ["documentIds"],
      },
    },
  ],
}));

/**
 * Route tool calls to their respective handlers.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "papercortex_search":
        return await handleSearch(ctx, args as Record<string, unknown>);
      case "papercortex_classify":
        return await handleClassify(ctx, args as Record<string, unknown>);
      case "papercortex_receipt":
        return await handleReceipt(ctx, args as Record<string, unknown>);
      case "papercortex_query":
        return await handleQuery(ctx, args as Record<string, unknown>);
      case "papercortex_export":
        return await handleExport(ctx, args as Record<string, unknown>);
      default:
        return {
          content: [
            { type: "text" as const, text: `Unknown tool: ${name}` },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return {
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
  });

  return server;
}

// Single shared instance for the stdio path (one local, non-concurrent client).
const server = createMcpServer();

// ---------------------------------------------------------------------------
// Start server — stdio (local) or http (remote / Cloudflare Tunnel)
// ---------------------------------------------------------------------------

async function startHttp(): Promise<void> {
  const port = parseInt(process.env["PORT"] ?? "3100", 10);
  // Track active SSE transports by session id
  const sessions: Record<string, SSEServerTransport> = {};

  const httpServer = http.createServer(async (req, res) => {
    try {
      if (req.url === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", service: "PaperCortex", transport: "http" }));
        return;
      }

      // SSE endpoint — client opens a long-lived connection
      if (req.url === "/sse" && req.method === "GET") {
        const transport = new SSEServerTransport("/messages", res);
        sessions[transport.sessionId] = transport;
        res.on("close", () => {
          delete sessions[transport.sessionId];
        });
        const connectionServer = createMcpServer();
        await connectionServer.connect(transport);
        return;
      }

      // Message endpoint — client posts tool calls here
      if (req.url?.startsWith("/messages") && req.method === "POST") {
        const sessionId = new URL(req.url, `http://localhost`).searchParams.get("sessionId");
        const transport = sessionId ? sessions[sessionId] : undefined;
        if (transport) {
          await transport.handlePostMessage(req, res);
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Session not found" }));
        }
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    } catch (err) {
      console.error("HTTP handler error:", err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal error");
      }
    }
  });

  httpServer.listen(port, () => {
    console.error(`PaperCortex MCP Server running on HTTP port ${port} (SSE at /sse)`);
  });
}

async function main(): Promise<void> {
  const transport = (process.env["TRANSPORT"] ?? "stdio").toLowerCase();

  if (transport === "http") {
    await startHttp();
  } else {
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("PaperCortex MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error starting PaperCortex:", error);
  process.exit(1);
});
