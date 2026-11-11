import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorage } from "@/lib/server/r2";
import { getPhotographerSession } from "@/lib/server/supabase";
import { presignView } from "@/lib/storage/s3";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SignOutButton } from "../../SignOutButton";
import { Workspace, type WorkspacePhoto } from "./Workspace";

export const metadata = { title: "Upload and tag" };

type PhotoRow = {
  id: string;
  batch_id: string;
  sequence: number;
  original_filename: string;
  object_key: string;
  upload_status: "pending" | "ready" | "rejected";
  rejection_reason: string | null;
  captured_at: string | null;
  capture_time_source: string;
  price_pence: number;
  published_at: string | null;
  created_at: string;
};

const PAGE = 1000;

/** Supabase returns at most 1000 rows per request, so page through. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function loadWorkspace(supabase: SupabaseClient, eventId: string, photographerId: string) {
  const [photos, entries, tags, suggestions, batches] = await Promise.all([
    fetchAll<PhotoRow>((a, b) =>
      supabase
        .from("photos")
        .select(
          "id, batch_id, sequence, original_filename, object_key, upload_status, rejection_reason, captured_at, capture_time_source, price_pence, published_at, created_at",
        )
        .eq("event_id", eventId)
        .eq("photographer_id", photographerId)
        .order("created_at", { ascending: false })
        .order("sequence", { ascending: true })
        .range(a, b),
    ),
    fetchAll<{ id: string; number: string }>((a, b) =>
      supabase.from("entries").select("id, number").eq("event_id", eventId).order("number").range(a, b),
    ),
    fetchAll<{ photo_id: string; entry_id: string }>((a, b) =>
      supabase.from("photo_tags").select("photo_id, entry_id").eq("event_id", eventId).range(a, b),
    ),
    fetchAll<{ id: string; photo_id: string; suggested_number: string; source: string; confidence: number | null }>((a, b) =>
      supabase
        .from("tag_suggestions")
        .select("id, photo_id, suggested_number, source, confidence")
        .eq("event_id", eventId)
        .eq("status", "pending")
        .range(a, b),
    ),
    fetchAll<{ id: string; created_at: string }>((a, b) =>
      supabase.from("upload_batches").select("id, created_at").eq("event_id", eventId).order("created_at").range(a, b),
    ),
  ]);
  return { photos, entries, tags, suggestions, batches };
}

export default async function EventWorkspacePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!isSupabaseConfigured()) redirect("/login");
  const session = await getPhotographerSession();
  if (!session) redirect("/login");
  if (!session.photographer || !/^[0-9a-f-]{36}$/i.test(eventId)) notFound();
  const { supabase, photographer } = session;

  const [{ data: event }, { data: membership }] = await Promise.all([
    supabase.from("events").select("id, slug, name, entry_label, is_public").eq("id", eventId).maybeSingle(),
    supabase
      .from("event_photographers")
      .select("status")
      .eq("event_id", eventId)
      .eq("photographer_id", photographer.id)
      .maybeSingle(),
  ]);
  if (!event || membership?.status !== "approved") {
    return (
      <main className="page narrow">
        <Link href="/photographer" className="back-link">← My events</Link>
        <h1>Not available</h1>
        <p>You’re not approved to upload to this event. Ask the organiser.</p>
      </main>
    );
  }

  const data = await loadWorkspace(supabase, eventId, photographer.id);
  const numberByEntry = new Map(data.entries.map((e) => [e.id, e.number]));
  const batchNumber = new Map(data.batches.map((b, i) => [b.id, i + 1]));
  const tagsByPhoto = new Map<string, string[]>();
  for (const t of data.tags) {
    const n = numberByEntry.get(t.entry_id);
    if (n) tagsByPhoto.set(t.photo_id, [...(tagsByPhoto.get(t.photo_id) ?? []), n]);
  }
  const suggestionsByPhoto = new Map<string, WorkspacePhoto["suggestions"]>();
  for (const s of data.suggestions) {
    suggestionsByPhoto.set(s.photo_id, [
      ...(suggestionsByPhoto.get(s.photo_id) ?? []),
      { id: s.id, number: s.suggested_number, source: s.source, confidence: s.confidence },
    ]);
  }

  const storage = getStorage();
  const photos: WorkspacePhoto[] = await Promise.all(
    data.photos.map(async (p) => ({
      id: p.id,
      batchNumber: batchNumber.get(p.batch_id) ?? 0,
      sequence: p.sequence,
      filename: p.original_filename,
      status: p.upload_status,
      rejectionReason: p.rejection_reason,
      capturedAt: p.captured_at,
      pricePence: p.price_pence,
      published: p.published_at !== null,
      thumbUrl: storage && p.upload_status === "ready" ? await presignView(storage, p.object_key) : null,
      tags: (tagsByPhoto.get(p.id) ?? []).sort((a, b) => a.localeCompare(b, "en-GB", { numeric: true })),
      suggestions: suggestionsByPhoto.get(p.id) ?? [],
    })),
  );

  return (
    <main className="page">
      <div className="topbar">
        <Link href="/photographer" className="back-link">← My events</Link>
        <SignOutButton />
      </div>
      <h1>{event.name}</h1>
      <p className="muted">
        Uploading as <strong>{photographer.display_name}</strong> · credit shown: “{photographer.credit}”
        {event.is_public ? (
          <>
            {" · "}
            <Link href={`/events/${event.slug}`}>Open public gallery</Link>
          </>
        ) : (
          " · Gallery not public yet"
        )}
      </p>
      <Workspace
        eventId={event.id}
        entryLabel={event.entry_label}
        entryNumbers={data.entries.map((e) => e.number)}
        photos={photos}
        uploadsEnabled={storage !== null}
      />
    </main>
  );
}
