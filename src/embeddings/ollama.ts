/**
 * Ollama embedding and LLM integration.
 *
 * Generates vector embeddings and LLM completions using a local Ollama instance.
 * All functions are pure and return new objects -- no mutation.
 *
 * @example
 * ```ts
 * const ollama = createOllamaClient({ baseUrl: "http://localhost:11434" });
 * const embedding = await ollama.embed("Office rent invoice March 2024");
 * const answer = await ollama.complete("Classify this document: ...");
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OllamaConfig {
  readonly baseUrl: string;
  readonly model: string;
  readonly embeddingModel: string;
  /** Optional multimodal model for photo receipts (e.g. "minicpm-v"). */
  readonly visionModel?: string;
  readonly timeout?: number;
}

export interface EmbeddingResult {
  readonly vector: readonly number[];
  readonly model: string;
  readonly dimensions: number;
}

export interface CompletionResult {
  readonly text: string;
  readonly model: string;
  readonly totalDuration: number;
}

export interface OllamaClient {
  /** Generate an embedding vector for the given text. */
  embed(text: string): Promise<EmbeddingResult>;

  /** Generate a chat/instruct completion. */
  complete(prompt: string, systemPrompt?: string): Promise<CompletionResult>;

  /** Whether a vision model is configured for image-based extraction. */
  supportsVision(): boolean;

  /** Completion with attached images (base64-encoded, no data: prefix). */
  completeVision(
    prompt: string,
    systemPrompt: string | undefined,
    imagesBase64: readonly string[],
  ): Promise<CompletionResult>;

  /** Check if the Ollama server is reachable and models are available. */
  healthCheck(): Promise<{ ok: boolean; models: readonly string[] }>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create an Ollama client for embeddings and completions.
 */
export function createOllamaClient(config: OllamaConfig): OllamaClient {
  const { baseUrl, model, embeddingModel, visionModel, timeout = 120_000 } = config;

  async function post<T>(path: string, body: unknown): Promise<T> {
    const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Ollama API error: ${response.status} -- ${text}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async embed(text) {
      // TODO: implement chunking for texts exceeding model context window
      // TODO: add retry logic with exponential backoff

      interface OllamaEmbedResponse {
        embedding: number[];
      }

      const result = await post<OllamaEmbedResponse>("/api/embeddings", {
        model: embeddingModel,
        prompt: text,
      });

      return {
        vector: result.embedding,
        model: embeddingModel,
        dimensions: result.embedding.length,
      };
    },

    async complete(prompt, systemPrompt) {
      // TODO: implement streaming support for long completions
      // TODO: add structured output parsing (JSON mode)

      interface OllamaGenerateResponse {
        response: string;
        model: string;
        total_duration: number;
      }

      const result = await post<OllamaGenerateResponse>("/api/generate", {
        model,
        prompt,
        system: systemPrompt ?? "",
        stream: false,
      });

      return {
        text: result.response,
        model: result.model,
        totalDuration: result.total_duration,
      };
    },

    supportsVision() {
      return Boolean(visionModel);
    },

    async completeVision(prompt, systemPrompt, imagesBase64) {
      if (!visionModel) {
        throw new Error("No vision model configured (OLLAMA_VISION_MODEL)");
      }
      interface OllamaGenerateResponse {
        response: string;
        model: string;
        total_duration: number;
      }
      const result = await post<OllamaGenerateResponse>("/api/generate", {
        model: visionModel,
        prompt,
        system: systemPrompt ?? "",
        images: [...imagesBase64],
        stream: false,
      });
      return {
        text: result.response,
        model: result.model,
        totalDuration: result.total_duration,
      };
    },

    async healthCheck() {
      try {
        const url = `${baseUrl.replace(/\/+$/, "")}/api/tags`;
        const response = await fetch(url);
        if (!response.ok) return { ok: false, models: [] };

        interface OllamaTagsResponse {
          models: Array<{ name: string }>;
        }

        const data = (await response.json()) as OllamaTagsResponse;
        return {
          ok: true,
          models: data.models.map((m) => m.name),
        };
      } catch {
        return { ok: false, models: [] };
      }
    },
  };
}
