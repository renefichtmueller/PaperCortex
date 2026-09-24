/**
 * Paperless-ngx REST API client.
 *
 * Provides typed access to documents, correspondents, tags, and document types.
 * All methods return immutable result objects.
 *
 * @example
 * ```ts
 * const client = createPaperlessClient({
 *   baseUrl: "http://localhost:8000",
 *   token: "your-api-token",
 * });
 * const docs = await client.getDocuments({ query: "invoice" });
 * ```
 */

import type {
  Correspondent,
  DocumentSearchParams,
  DocumentType,
  PaginatedResponse,
  PaperlessConfig,
  PaperlessDocument,
  Tag,
} from "./types.js";

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

export interface PaperlessClient {
  /** Fetch a single document by ID. */
  getDocument(id: number): Promise<PaperlessDocument>;

  /** Search / list documents with optional filters. */
  getDocuments(
    params?: DocumentSearchParams,
  ): Promise<PaginatedResponse<PaperlessDocument>>;

  /** Fetch all correspondents. */
  getCorrespondents(): Promise<PaginatedResponse<Correspondent>>;

  /** Fetch all tags. */
  getTags(): Promise<PaginatedResponse<Tag>>;

  /** Fetch all document types. */
  getDocumentTypes(): Promise<PaginatedResponse<DocumentType>>;

  /** Download the original file content of a document. */
  downloadDocument(id: number): Promise<ArrayBuffer>;

  /** Download the rendered first-page thumbnail (PNG/WebP). */
  downloadThumbnail(id: number): Promise<ArrayBuffer>;

  /** Update tags on a document (immutable -- returns the updated doc). */
  updateDocumentTags(
    id: number,
    tagIds: readonly number[],
  ): Promise<PaperlessDocument>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a new Paperless-ngx API client.
 *
 * @param config - Connection configuration (URL + token).
 * @returns A {@link PaperlessClient} instance.
 */
export function createPaperlessClient(config: PaperlessConfig): PaperlessClient {
  const { baseUrl, token, timeout = 30_000 } = config;

  const headers: Record<string, string> = {
    Authorization: `Token ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json; version=3",
  };

  /**
   * Internal fetch wrapper with timeout and error handling.
   */
  async function request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${baseUrl.replace(/\/+$/, "")}/api${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...((options.headers as Record<string, string>) ?? {}) },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Paperless API error: ${response.status} ${response.statusText} -- ${body}`,
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Build query string from search params.
   */
  function buildQuery(params?: DocumentSearchParams): string {
    if (!params) return "";
    const entries = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null,
    );
    if (entries.length === 0) return "";
    const searchParams = new URLSearchParams();
    for (const [key, value] of entries) {
      if (Array.isArray(value)) {
        searchParams.set(key, value.join(","));
      } else {
        searchParams.set(key, String(value));
      }
    }
    return `?${searchParams.toString()}`;
  }

  async function downloadBinary(url: string): Promise<ArrayBuffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Token ${token}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Paperless download error: ${response.status} ${response.statusText}`,
        );
      }
      return await response.arrayBuffer();
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getDocument(id) {
      return request<PaperlessDocument>(`/documents/${id}/`);
    },

    async getDocuments(params) {
      return request<PaginatedResponse<PaperlessDocument>>(
        `/documents/${buildQuery(params)}`,
      );
    },

    async getCorrespondents() {
      return request<PaginatedResponse<Correspondent>>("/correspondents/");
    },

    async getTags() {
      return request<PaginatedResponse<Tag>>("/tags/");
    },

    async getDocumentTypes() {
      return request<PaginatedResponse<DocumentType>>("/document_types/");
    },

    async downloadDocument(id) {
      return downloadBinary(`${baseUrl.replace(/\/+$/, "")}/api/documents/${id}/download/`);
    },

    async downloadThumbnail(id) {
      return downloadBinary(`${baseUrl.replace(/\/+$/, "")}/api/documents/${id}/thumb/`);
    },

    async updateDocumentTags(id, tagIds) {
      return request<PaperlessDocument>(`/documents/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ tags: [...tagIds] }),
      });
    },
  };
}
