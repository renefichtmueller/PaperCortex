/**
 * Standalone web UI entry point: `npm run webui`.
 * Runs the settings/export page without the MCP server.
 */

import { config } from "dotenv";

import { createOllamaClient } from "../embeddings/ollama.js";
import { createVectorStore } from "../embeddings/store.js";
import { createPaperlessClient } from "../paperless/client.js";
import { maybeStartWebUi } from "./start.js";

config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key} (siehe .env.example)`,
    );
  }
  return value;
}

const started = maybeStartWebUi({
  paperless: createPaperlessClient({
    baseUrl: requireEnv("PAPERLESS_URL"),
    token: requireEnv("PAPERLESS_TOKEN"),
  }),
  ollama: createOllamaClient({
    baseUrl: process.env["OLLAMA_URL"] ?? "http://localhost:11434",
    model: process.env["OLLAMA_MODEL"] ?? "qwen2.5:14b",
    embeddingModel: process.env["OLLAMA_EMBEDDING_MODEL"] ?? "nomic-embed-text",
  visionModel: process.env["OLLAMA_VISION_MODEL"] || undefined,
  }),
  vectorStore: createVectorStore({
    dbPath: process.env["VECTOR_DB_PATH"] ?? "./data/vectors.db",
  }),
});

if (!started) {
  console.error("Web UI disabled (WEBUI_ENABLED=false) — nothing to do.");
  process.exit(1);
}
