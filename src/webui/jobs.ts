/**
 * In-memory analysis job: extracts receipts in the background so the
 * browser can poll progress instead of waiting on one multi-minute HTTP
 * request (LLM extraction takes seconds per document). One job at a time
 * is plenty for a single-household/single-company tool.
 */

import type { DatevService } from "../datev/service.js";

export interface AnalyzeJobStatus {
  readonly state: "idle" | "running" | "done" | "failed";
  readonly total: number;
  readonly done: number;
  readonly errors: readonly { documentId: number; error: string }[];
  readonly message?: string;
}

export interface AnalyzeJobs {
  /** Start extraction; returns false when a job is already running. */
  start(documentIds: readonly number[], refresh: boolean): boolean;
  status(): AnalyzeJobStatus;
}

export function createAnalyzeJobs(service: DatevService): AnalyzeJobs {
  let current: AnalyzeJobStatus = { state: "idle", total: 0, done: 0, errors: [] };

  return {
    start(documentIds, refresh) {
      if (current.state === "running") return false;
      current = { state: "running", total: documentIds.length, done: 0, errors: [] };
      void service
        .collectReceipts(documentIds, {
          refresh,
          onProgress: (done, total) => {
            current = { ...current, done, total };
          },
        })
        .then((result) => {
          current = {
            state: "done",
            total: documentIds.length,
            done: documentIds.length,
            errors: result.failures,
          };
        })
        .catch((error: unknown) => {
          current = {
            ...current,
            state: "failed",
            message: error instanceof Error ? error.message : String(error),
          };
        });
      return true;
    },

    status() {
      return current;
    },
  };
}
