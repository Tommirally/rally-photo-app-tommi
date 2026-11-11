"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatPence } from "@/lib/gallery";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Uploader } from "./Uploader";

export interface WorkspacePhoto {
  id: string;
  batchNumber: number;
  sequence: number;
  filename: string;
  status: "pending" | "ready" | "rejected";
  rejectionReason: string | null;
  capturedAt: string | null;
  pricePence: number;
  published: boolean;
  thumbUrl: string | null;
  tags: string[];
  suggestions: { id: string; number: string; source: string; confidence: number | null }[];
}

type Filter = "all" | "untagged" | "unpublished" | "published" | "problems";

const FILTERS: { id: Filter; label: string; test: (p: WorkspacePhoto) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "untagged", label: "Needs tags", test: (p) => p.status === "ready" && p.tags.length === 0 },
  { id: "unpublished", label: "Not published", test: (p) => p.status === "ready" && !p.published },
  { id: "published", label: "Published", test: (p) => p.published },
  { id: "problems", label: "Problems", test: (p) => p.status !== "ready" },
];

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/London" });

function parseNumbers(input: string): string[] {
  return input
    .split(/[\s,;]+/)
    .map((n) => n.trim().toUpperCase())
    .filter(Boolean);
}

export function Workspace({
  eventId,
  entryLabel,
  entryNumbers,
  photos,
  uploadsEnabled,
}: {
  eventId: string;
  entryLabel: string;
  entryNumbers: string[];
  photos: WorkspacePhoto[];
  uploadsEnabled: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [numbers, setNumbers] = useState("");
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const visible = useMemo(() => photos.filter(FILTERS.find((f) => f.id === filter)!.test), [photos, filter]);
  const selectedIds = photos.filter((p) => selected.has(p.id)).map((p) => p.id);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, photos.filter(f.test).length])), [photos]);

  const refresh = () => startTransition(() => router.refresh());

  function toggle(id: string, shift: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastClicked) {
        const ids = visible.map((p) => p.id);
        const [a, b] = [ids.indexOf(lastClicked), ids.indexOf(id)].sort((x, y) => x - y);
        if (a >= 0) ids.slice(a, b + 1).forEach((x) => next.add(x));
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastClicked(id);
  }

  async function act(fn: () => Promise<{ kind: "ok" | "error"; text: string }>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await fn());
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const rpc = async <T,>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await createSupabaseBrowserClient().rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  };

  const addTags = () =>
    act(async () => {
      const nums = parseNumbers(numbers);
      if (!nums.length) return { kind: "error", text: `Type one or more ${entryLabel.toLowerCase()} numbers first.` };
      const r = await rpc<{ added: number; missing: string[]; error?: string }>("add_photo_tags", {
        p_photo_ids: selectedIds,
        p_numbers: nums,
      });
      if (r.missing.length) {
        return { kind: "error", text: `Not on the entry list: ${r.missing.join(", ")}. Nothing was tagged.` };
      }
      if (r.error) return { kind: "error", text: r.error };
      setNumbers("");
      return { kind: "ok", text: `Added ${r.added} tag${r.added === 1 ? "" : "s"}.` };
    });

  const removeTags = (ids: string[], nums: string[]) =>
    act(async () => {
      const r = await rpc<{ removed: number }>("remove_photo_tags", { p_photo_ids: ids, p_numbers: nums });
      return { kind: "ok", text: `Removed ${r.removed} tag${r.removed === 1 ? "" : "s"}.` };
    });

  const publish = (on: boolean) =>
    act(async () => {
      const r = await rpc<{ updated: number; skipped_not_ready: number }>("set_photos_published", {
        p_photo_ids: selectedIds,
        p_published: on,
      });
      const skipped = r.skipped_not_ready ? ` ${r.skipped_not_ready} not ready (still uploading or rejected).` : "";
      return { kind: "ok", text: `${on ? "Published" : "Unpublished"} ${r.updated}.${skipped}` };
    });

  const setPriceAll = () =>
    act(async () => {
      const pounds = Number(price.replace(/[£\s]/g, ""));
      if (!Number.isFinite(pounds) || pounds < 0 || pounds > 1000) return { kind: "error", text: "Enter a price like 7.50" };
      const r = await rpc<{ updated: number }>("set_photos_price", {
        p_photo_ids: selectedIds,
        p_price_pence: Math.round(pounds * 100),
      });
      return { kind: "ok", text: `Price set on ${r.updated} photo${r.updated === 1 ? "" : "s"}.` };
    });

  const review = (id: string, accept: boolean) =>
    act(async () => {
      const r = await rpc<{ status: string; error?: string }>("review_tag_suggestion", {
        p_suggestion_id: id,
        p_accept: accept,
      });
      return r.error ? { kind: "error", text: r.error } : { kind: "ok", text: `Suggestion ${r.status}.` };
    });

  return (
    <div className="workspace">
      {uploadsEnabled ? (
        <Uploader eventId={eventId} onFinished={refresh} />
      ) : (
        <p className="notice">Uploads are not configured on this server yet (R2 settings are missing).</p>
      )}

      <section className="panel" aria-labelledby="photos-heading">
        <div className="row spread">
          <h2 id="photos-heading">Your photos</h2>
          <span className="muted small">{photos.length} total</span>
        </div>
        <div className="filter-tabs" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`chip${filter === f.id ? " chip-active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label} ({counts[f.id]})
            </button>
          ))}
        </div>
        <div className="row small">
          <button type="button" className="link-button" onClick={() => setSelected(new Set(visible.map((p) => p.id)))}>
            Select all shown
          </button>
          <button type="button" className="link-button" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
          <span className="muted">Tip: shift-click to select a run of photos.</span>
        </div>

        {visible.length === 0 ? (
          <p className="muted">Nothing here yet.</p>
        ) : (
          <ul className="work-grid">
            {visible.map((p) => (
              <li
                key={p.id}
                className={`work-card${selected.has(p.id) ? " selected" : ""}`}
                data-testid="work-card"
                data-filename={p.filename}
              >
                <label className="work-select">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => {}}
                    onClick={(e) => toggle(p.id, e.shiftKey)}
                    aria-label={`Select ${p.filename}`}
                  />
                  {p.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL
                    <img src={p.thumbUrl} alt={p.filename} loading="lazy" className="work-thumb" />
                  ) : (
                    <span className="work-thumb work-thumb-empty">
                      {p.status === "pending" ? "Upload incomplete" : p.status === "rejected" ? "Rejected" : "No preview"}
                    </span>
                  )}
                </label>
                <div className="work-body">
                  <div className="row spread small">
                    <span className="mono" title={p.filename}>
                      {p.filename}
                    </span>
                    <span className={`badge badge-${p.published ? "live" : p.status}`}>
                      {p.published ? "Published" : p.status === "ready" ? "Private" : p.status === "pending" ? "Incomplete" : "Rejected"}
                    </span>
                  </div>
                  <div className="muted small">
                    Upload {p.batchNumber} · #{p.sequence}
                    {p.capturedAt ? ` · ${timeFmt.format(new Date(p.capturedAt))}` : " · no capture time"}
                    {` · ${formatPence(p.pricePence)}`}
                  </div>
                  {p.rejectionReason && <div className="form-error small">{p.rejectionReason}</div>}
                  <div className="tag-row">
                    {p.tags.map((n) => (
                      <span key={n} className="car-badge">
                        {n}
                        <button
                          type="button"
                          className="tag-x"
                          aria-label={`Remove tag ${n} from ${p.filename}`}
                          disabled={busy}
                          onClick={() => removeTags([p.id], [n])}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {p.suggestions.map((s) => (
                      <span key={s.id} className="suggestion" title={`Suggested by ${s.source}`}>
                        {s.number}?
                        <button type="button" disabled={busy} onClick={() => review(s.id, true)} aria-label={`Accept ${s.number}`}>
                          ✓
                        </button>
                        <button type="button" disabled={busy} onClick={() => review(s.id, false)} aria-label={`Reject ${s.number}`}>
                          ✗
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`bulk-bar${selectedIds.length ? " active" : ""}`} aria-label="Bulk actions">
        <div className="bulk-head">
          <strong data-testid="selected-count">{selectedIds.length} selected</strong>
          {message && (
            <span className={message.kind === "error" ? "form-error" : "ok-text"} role="status" data-testid="bulk-message">
              {message.text}
            </span>
          )}
        </div>
        <div className="bulk-row">
          <input
            className="text-input"
            value={numbers}
            onChange={(e) => setNumbers(e.target.value)}
            placeholder={`${entryLabel} numbers, e.g. 32, 032`}
            aria-label={`${entryLabel} numbers to tag`}
            list="entry-numbers"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <datalist id="entry-numbers">
            {entryNumbers.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <button type="button" className="primary-button" disabled={busy || !selectedIds.length} onClick={addTags}>
            Add tags
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !selectedIds.length}
            onClick={() => removeTags(selectedIds, parseNumbers(numbers))}
          >
            Remove
          </button>
        </div>
        <div className="bulk-row">
          <button type="button" className="primary-button" disabled={busy || !selectedIds.length} onClick={() => publish(true)}>
            Publish
          </button>
          <button type="button" className="secondary-button" disabled={busy || !selectedIds.length} onClick={() => publish(false)}>
            Unpublish
          </button>
          <input
            className="text-input price-input"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="£ price"
            inputMode="decimal"
            aria-label="Price in pounds"
          />
          <button type="button" className="secondary-button" disabled={busy || !selectedIds.length} onClick={setPriceAll}>
            Set price
          </button>
        </div>
      </section>
    </div>
  );
}
