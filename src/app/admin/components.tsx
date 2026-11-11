"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import { ENTRY_CSV_TEMPLATE, parseEntryList } from "@/lib/admin/entry-csv";
import { createEvent, deleteEntry, importEntries, setEventPublic, updateEvent, type FormState } from "./actions";

export interface EventFormValues {
  id?: string;
  name: string;
  slug?: string;
  isPublic?: boolean;
  start_date: string;
  end_date: string;
  venue: string;
  organiser: string;
  sport: string;
  entry_label: string;
  location_label: string;
}

function Message({ state }: { state: FormState }) {
  if (!state) return null;
  return state.error ? (
    <p className="form-error" role="alert">
      {state.error}
    </p>
  ) : state.ok ? (
    <p className="ok-text" role="status">
      {state.ok}
    </p>
  ) : null;
}

export function EventForm({ values }: { values: EventFormValues }) {
  const action = values.id ? updateEvent.bind(null, values.id) : createEvent;
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="stack-form">
      <label>
        Event name
        <input name="name" defaultValue={values.name} required maxLength={200} className="text-input" placeholder="Malton Forest Rally 2026" />
      </label>
      <div className="two-col">
        <label>
          Date
          <input name="start_date" type="date" defaultValue={values.start_date} required className="text-input" />
        </label>
        <label>
          Last day <span className="muted small">(if more than one day)</span>
          <input name="end_date" type="date" defaultValue={values.end_date === values.start_date ? "" : values.end_date} className="text-input" />
        </label>
      </div>
      <label>
        Venue
        <input name="venue" defaultValue={values.venue} maxLength={200} className="text-input" placeholder="Dalby Forest, North Yorkshire" />
      </label>
      <label>
        Organiser
        <input name="organiser" defaultValue={values.organiser} maxLength={200} className="text-input" placeholder="Example Motor Club" />
      </label>
      {values.id && (
        <label>
          Web address
          <span className="slug-field">
            <span className="muted">/events/</span>
            <input
              name="slug"
              defaultValue={values.slug}
              className="text-input"
              readOnly={values.isPublic}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="lower-case letters, numbers and dashes"
            />
          </span>
          {values.isPublic && <span className="muted small">Locked while the gallery is public, so shared links keep working.</span>}
        </label>
      )}
      <details>
        <summary className="muted small">Other sports (optional)</summary>
        <div className="stack-form">
          <label>
            Sport
            <input name="sport" defaultValue={values.sport} className="text-input" />
          </label>
          <label>
            Competitors are called
            <input name="entry_label" defaultValue={values.entry_label} className="text-input" />
          </label>
          <label>
            Locations are called
            <input name="location_label" defaultValue={values.location_label} className="text-input" />
          </label>
        </div>
      </details>
      <Message state={state} />
      <button type="submit" className="primary-button" disabled={pending}>
        {pending ? "Saving…" : values.id ? "Save changes" : "Create event"}
      </button>
    </form>
  );
}

export function PublicSwitch({ eventId, isPublic, url }: { eventId: string; isPublic: boolean; url: string }) {
  const [state, setState] = useState<FormState>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const toggle = () =>
    start(async () => {
      if (isPublic && !confirm("Hide this gallery? People with the link will see “not found”.")) return;
      setState(await setEventPublic(eventId, !isPublic));
      router.refresh();
    });
  return (
    <div className="stack-form">
      <div className="row">
        <span className={`badge ${isPublic ? "badge-live" : ""}`} data-testid="public-state">
          {isPublic ? "Gallery is public" : "Draft – only photographers can see it"}
        </span>
        <button type="button" className={isPublic ? "secondary-button" : "primary-button"} onClick={toggle} disabled={pending}>
          {isPublic ? "Hide gallery" : "Make gallery public"}
        </button>
      </div>
      <div className="row">
        <code className="share-url">{url}</code>
        <button
          type="button"
          className="secondary-button"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        {isPublic && (
          <a href={url} target="_blank" rel="noreferrer" className="secondary-button">
            Open
          </a>
        )}
      </div>
      <Message state={state} />
    </div>
  );
}

export interface ExistingEntry {
  number: string;
  competitors: string[];
  vehicle: string | null;
  className: string | null;
}

export function EntryImport({ eventId, existing }: { eventId: string; existing: ExistingEntry[] }) {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<FormState>(null);
  const [pending, start] = useTransition();

  const result = useMemo(() => (text === null ? null : parseEntryList(text)), [text]);
  const byNumber = useMemo(() => new Map(existing.map((e) => [e.number, e])), [existing]);

  const statusOf = (e: ReturnType<typeof parseEntryList>["entries"][number]) => {
    const old = byNumber.get(e.number);
    if (!old) return "new";
    const same =
      old.competitors.join("|") === e.competitors.join("|") && (old.vehicle ?? null) === e.vehicle && (old.className ?? null) === e.className;
    return same ? "same" : "changed";
  };

  const counts = result
    ? result.entries.reduce((acc, e) => ({ ...acc, [statusOf(e)]: (acc[statusOf(e)] ?? 0) + 1 }), {} as Record<string, number>)
    : {};

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(ENTRY_CSV_TEMPLATE)}`;

  return (
    <div className="stack-form">
      <div className="row">
        <label className="primary-button file-button">
          {fileName ? "Choose a different file" : "Choose entry list (.csv)"}
          <input
            type="file"
            accept=".csv,text/csv"
            data-testid="csv-input"
            onChange={async (ev) => {
              const f = ev.target.files?.[0];
              ev.target.value = "";
              if (!f) return;
              setState(null);
              setFileName(f.name);
              setText(await f.text());
            }}
          />
        </label>
        <a href={templateHref} download="entry-list-template.csv" className="link-button">
          Download a template
        </a>
      </div>
      <p className="muted small">
        Headings needed in the first row: <strong>No</strong>, and ideally Driver, Co-driver, Car, Class. Numbers are
        kept exactly as written – <strong>32, 032 and 320 are different cars</strong>. Excel can drop leading zeros
        (032 → 32): check the preview below.
      </p>

      {result && (
        <div className="preview" data-testid="csv-preview">
          <h3>
            Preview of {fileName}: {result.entries.length} cars
          </h3>
          {result.problems.length > 0 && (
            <div className="form-error" role="alert">
              <strong>Fix these in the file, then choose it again:</strong>
              <ul>
                {result.problems.slice(0, 20).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {result.warnings.length > 0 && (
            <div className="notice">
              <strong>Please check:</strong>
              <ul>
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {result.entries.length > 0 && (
            <>
              <p className="small">
                {counts.new ?? 0} new · {counts.changed ?? 0} changed · {counts.same ?? 0} unchanged. Cars already on the
                list but not in this file are kept.
              </p>
              <div className="table-wrap">
                <table className="entry-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Crew</th>
                      <th>Car</th>
                      <th>Class</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.entries.map((e) => {
                      const s = statusOf(e);
                      return (
                        <tr key={e.number} className={`row-${s}`}>
                          <td className="num">{e.number}</td>
                          <td>{e.competitors.join(" / ")}</td>
                          <td>{e.vehicle}</td>
                          <td>{e.className}</td>
                          <td className="small">{s === "new" ? "New" : s === "changed" ? "Updated" : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="row">
            <button
              type="button"
              className="primary-button"
              disabled={pending || result.problems.length > 0 || result.entries.length === 0}
              onClick={() =>
                start(async () => {
                  const r = await importEntries(eventId, text ?? "");
                  setState(r);
                  if (!r?.error) {
                    setText(null);
                    setFileName(null);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Saving…" : `Save ${result.entries.length} cars`}
            </button>
            <button type="button" className="link-button" onClick={() => (setText(null), setFileName(null))}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <Message state={state} />
    </div>
  );
}

export function DeleteEntryButton({ eventId, entryId, number, taggedPhotos }: { eventId: string; entryId: string; number: string; taggedPhotos: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="link-button"
      disabled={pending}
      aria-label={`Remove car ${number}`}
      onClick={() => {
        const warn = taggedPhotos
          ? `Remove car ${number}? Its tags on ${taggedPhotos} photo(s) will also be removed.`
          : `Remove car ${number}?`;
        if (!confirm(warn)) return;
        start(async () => {
          const r = await deleteEntry(eventId, entryId);
          if (r?.error) alert(r.error);
          router.refresh();
        });
      }}
    >
      Remove
    </button>
  );
}
