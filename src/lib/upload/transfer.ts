/**
 * Browser-side upload of one file straight to R2, with retries.
 * Pure logic with injectable fetch/sleep so it can be tested in Node.
 */

export interface TransferDeps {
  fetch: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Ask our server for a fresh signed URL (the old one may have expired). */
  refreshUrl: () => Promise<string>;
  /** Tell our server the file is in R2 so it can verify it. */
  complete: () => Promise<CompleteResult>;
  onAttempt?: (attempt: number, phase: "upload" | "verify") => void;
}

export type CompleteResult =
  | { status: "ready" }
  | { status: "rejected"; reason: string }
  | { status: "missing" };

export type TransferResult =
  | { status: "ready"; attempts: number }
  | { status: "rejected"; reason: string; attempts: number }
  | { status: "failed"; reason: string; attempts: number };

export const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 800;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export async function transferFile(file: Blob, initialUrl: string, deps: TransferDeps): Promise<TransferResult> {
  const sleep = deps.sleep ?? defaultSleep;
  let url = initialUrl;
  let attempts = 0;
  let lastReason = "Upload failed";

  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    if (attempts > 1) await sleep(BASE_DELAY_MS * 2 ** (attempts - 2));
    deps.onAttempt?.(attempts, "upload");

    // 1. PUT the bytes to R2.
    let res: Response;
    try {
      res = await deps.fetch(url, { method: "PUT", body: file, headers: { "Content-Type": "image/jpeg" } });
    } catch {
      lastReason = "Network error while uploading";
      continue;
    }
    if (res.status === 403 || res.status === 400) {
      // Signature expired or rejected: get a fresh URL and try again.
      lastReason = `Storage refused the upload (${res.status})`;
      try {
        url = await deps.refreshUrl();
      } catch {
        return { status: "failed", reason: "Could not get a new upload link", attempts };
      }
      continue;
    }
    if (!res.ok) {
      lastReason = `Storage error (${res.status})`;
      if (isRetryableStatus(res.status)) continue;
      return { status: "failed", reason: lastReason, attempts };
    }

    // 2. Ask our server to verify it.
    deps.onAttempt?.(attempts, "verify");
    let result: CompleteResult | null = null;
    for (let v = 0; v < 3 && !result; v++) {
      try {
        result = await deps.complete();
      } catch {
        lastReason = "Network error while checking the upload";
        await sleep(BASE_DELAY_MS * 2 ** v);
      }
    }
    if (!result) continue;
    if (result.status === "ready") return { status: "ready", attempts };
    if (result.status === "rejected") return { status: "rejected", reason: result.reason, attempts };
    lastReason = "The file did not arrive in storage";
  }
  return { status: "failed", reason: lastReason, attempts };
}

/** Run tasks with limited parallelism. */
export async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}
