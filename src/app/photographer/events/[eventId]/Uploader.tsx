"use client";

import { useRef, useState } from "react";
import { UPLOAD_LIMITS, checkFiles, formatBytes } from "@/lib/upload/limits";
import { runWithConcurrency, transferFile, type CompleteResult } from "@/lib/upload/transfer";

type ItemStatus = "skipped" | "queued" | "uploading" | "verifying" | "ready" | "rejected" | "failed";

interface Item {
  key: string;
  file: File;
  status: ItemStatus;
  reason?: string;
  attempt?: number;
  photoId?: string;
  uploadUrl?: string;
}

const STATUS_TEXT: Record<ItemStatus, string> = {
  skipped: "Not uploaded",
  queued: "Waiting",
  uploading: "Uploading",
  verifying: "Checking",
  ready: "Done",
  rejected: "Rejected",
  failed: "Failed",
};

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

export function Uploader({ eventId, onFinished }: { eventId: string; onFinished: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  async function transfer(item: Item) {
    let url = item.uploadUrl!;
    const result = await transferFile(item.file, url, {
      fetch: (input, init) => fetch(input, init),
      refreshUrl: async () => {
        const { res, json } = await postJson(`/api/photographer/photos/${item.photoId}/upload-url`);
        if (!res.ok) throw new Error(json.error ?? "No new link");
        url = json.uploadUrl;
        update(item.key, { uploadUrl: url });
        return url;
      },
      complete: async () => {
        const { res, json } = await postJson(`/api/photographer/photos/${item.photoId}/complete`);
        if (!res.ok) throw new Error(json.error ?? `Check failed (${res.status})`);
        return json as CompleteResult;
      },
      onAttempt: (attempt, phase) => update(item.key, { status: phase === "upload" ? "uploading" : "verifying", attempt }),
    });
    if (result.status === "ready") update(item.key, { status: "ready", reason: undefined });
    else update(item.key, { status: result.status, reason: result.reason });
  }

  async function createBatch(files: Item[]) {
    const { res, json } = await postJson(`/api/photographer/events/${eventId}/batches`, {
      files: files.map((it) => ({ name: it.file.name, size: it.file.size, type: it.file.type })),
    });
    if (!res.ok) {
      const reason = json.error ?? `Could not start the upload (${res.status})`;
      setError(reason);
      files.forEach((it) => update(it.key, { status: "failed", reason }));
      return [];
    }
    const photos = json.photos as { id: string; uploadUrl: string }[];
    return files.map((it, i) => {
      const patch = { photoId: photos[i].id, uploadUrl: photos[i].uploadUrl };
      update(it.key, patch);
      return { ...it, ...patch };
    });
  }

  async function run(work: Item[]) {
    setRunning(true);
    setError(null);
    try {
      const withoutPhoto = work.filter((it) => !it.photoId);
      const created = withoutPhoto.length ? await createBatch(withoutPhoto) : [];
      const ready = [...work.filter((it) => it.photoId), ...created];
      await runWithConcurrency(ready, 3, transfer);
    } finally {
      setRunning(false);
      onFinished();
    }
  }

  function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const { accepted, rejected } = checkFiles(files);
    const stamp = Date.now();
    const next: Item[] = [
      ...accepted.map((file, i) => ({ key: `${stamp}-${i}`, file, status: "queued" as const })),
      ...rejected.map(({ file, reason }, i) => ({ key: `${stamp}-r${i}`, file, status: "skipped" as const, reason })),
    ];
    setItems(next);
    const queued = next.filter((it) => it.status === "queued");
    if (queued.length) void run(queued);
  }

  const failed = items.filter((it) => it.status === "failed");
  // fetch() throws (no HTTP status) when the browser blocks the request, which
  // for R2 almost always means the bucket's CORS policy doesn't list this site.
  const blocked = !running && failed.some((it) => it.reason?.startsWith("Network error while uploading"));
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const done = items.filter((it) => it.status === "ready").length;
  const total = items.filter((it) => it.status !== "skipped").length;

  return (
    <section className="panel" aria-labelledby="upload-heading">
      <h2 id="upload-heading">Upload photos</h2>
      <p className="muted small">
        Web-sized JPEGs only: up to {formatBytes(UPLOAD_LIMITS.maxFileBytes)} each, {UPLOAD_LIMITS.minLongEdgePx}–
        {UPLOAD_LIMITS.maxLongEdgePx}px on the long edge, {UPLOAD_LIMITS.maxFilesPerBatch} per upload. Photos go live in
        the gallery as soon as they finish uploading – tag them whenever you can.
      </p>
      <div className="row">
        <label className={`primary-button file-button${running ? " disabled" : ""}`}>
          Choose photos
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,.jpg,.jpeg"
            multiple
            disabled={running}
            onChange={onChoose}
            data-testid="file-input"
          />
        </label>
        {failed.length > 0 && !running && (
          <button type="button" className="secondary-button" onClick={() => run(failed)}>
            Retry {failed.length} failed
          </button>
        )}
      </div>
      {blocked && (
        <div className="notice" role="alert" data-testid="cors-help">
          <strong>Your browser couldn’t reach photo storage.</strong> If this happens for every photo, the Cloudflare R2
          bucket’s CORS policy doesn’t include this site’s address. In Cloudflare: R2 → your bucket → Settings → CORS
          Policy, make sure <code>AllowedOrigins</code> contains exactly <code>{origin}</code> (no slash at the end), save,
          wait a minute, then press <em>Retry failed</em>.
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {items.length > 0 && (
        <>
          <p className="small" aria-live="polite" data-testid="upload-summary">
            {running ? "Uploading…" : "Finished."} {done} of {total} done
            {failed.length ? `, ${failed.length} failed` : ""}.
          </p>
          <ul className="upload-list" data-testid="upload-list">
            {items.map((it) => (
              <li key={it.key} className={`upload-item status-${it.status}`} data-status={it.status}>
                <span className="upload-name">{it.file.name}</span>
                <span className="upload-status">
                  {STATUS_TEXT[it.status]}
                  {it.attempt && it.attempt > 1 && (it.status === "uploading" || it.status === "verifying")
                    ? ` (try ${it.attempt})`
                    : ""}
                </span>
                {it.reason && <span className="upload-reason">{it.reason}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
