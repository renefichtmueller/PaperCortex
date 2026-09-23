/**
 * TypeScript type definitions for the Paperless-ngx REST API.
 *
 * Based on Paperless-ngx API v3+.
 * @see https://docs.paperless-ngx.com/api/
 */

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Generic paginated response envelope from Paperless-ngx. */
export interface PaginatedResponse<T> {
  readonly count: number;
  readonly next: string | null;
  readonly previous: string | null;
  readonly results: readonly T[];
}

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface PaperlessDocument {
  readonly id: number;
  readonly correspondent: number | null;
  readonly document_type: number | null;
  readonly storage_path: number | null;
  readonly title: string;
  readonly content: string;
  readonly tags: readonly number[];
  readonly created: string;
  readonly created_date: string;
  readonly modified: string;
  readonly added: string;
  readonly archive_serial_number: number | null;
  readonly original_file_name: string;
  readonly archived_file_name: string | null;
  readonly owner: number | null;
  readonly notes: readonly DocumentNote[];
  readonly custom_fields: readonly CustomFieldValue[];
}

export interface DocumentNote {
  readonly id: number;
  readonly note: string;
  readonly created: string;
  readonly user: number;
}

export interface CustomFieldValue {
  readonly field: number;
  readonly value: string | number | boolean | null;
}

export interface Correspondent {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly match: string;
  readonly matching_algorithm: number;
  readonly is_insensitive: boolean;
  readonly document_count: number;
  readonly last_correspondence: string | null;
}

export interface DocumentType {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly match: string;
  readonly matching_algorithm: number;
  readonly is_insensitive: boolean;
  readonly document_count: number;
}

export interface Tag {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly color: string;
  readonly text_color: string;
  readonly match: string;
  readonly matching_algorithm: number;
  readonly is_insensitive: boolean;
  readonly is_inbox_tag: boolean;
  readonly document_count: number;
}

export interface StoragePath {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly path: string;
  readonly match: string;
  readonly matching_algorithm: number;
  readonly is_insensitive: boolean;
  readonly document_count: number;
}

// ---------------------------------------------------------------------------
// Search & filter
// ---------------------------------------------------------------------------

export interface DocumentSearchParams {
  readonly query?: string;
  readonly correspondent__id?: number;
  readonly document_type__id?: number;
  readonly tags__id__all?: readonly number[];
  readonly tags__id__none?: readonly number[];
  readonly created__date__gt?: string;
  readonly created__date__lt?: string;
  readonly created__date__gte?: string;
  readonly created__date__lte?: string;
  readonly ordering?: string;
  readonly page?: number;
  readonly page_size?: number;
}

// ---------------------------------------------------------------------------
// API client configuration
// ---------------------------------------------------------------------------

export interface PaperlessConfig {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeout?: number;
}
