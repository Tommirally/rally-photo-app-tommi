import "server-only";
import { cache } from "react";
import { getGallery as getDemoGallery, listEvents as listDemoEvents, normaliseEntryNumber } from "@/lib/gallery";
import { presignView } from "@/lib/storage/s3";
import type { DemoPreview } from "@/lib/types";
import { getStorage } from "./r2";
import { createSupabasePublicClient } from "./supabase";

export interface GalleryEventView {
  slug: string;
  name: string;
  entryLabel: string;
  organiser: string;
  venue: string;
  startDate: string;
  isDemo: boolean;
}

export interface GalleryPhotoView {
  id: string;
  imageUrl: string | null;
  demoPreview: DemoPreview | null;
  numbers: string[];
  photographerName: string;
  credit: string;
  location: string;
  takenAt: string | null;
  pricePence: number;
}

export interface GalleryView {
  event: GalleryEventView;
  photographerNames: string[];
  /** Quick-pick car numbers. */
  numbers: string[];
  query: string | null;
  matchedEntry: { number: string; competitors: string[]; vehicle: string | null; className: string | null } | null;
  photos: GalleryPhotoView[];
  /** True when showing the latest photos only (no search yet, more exist). */
  truncated: boolean;
}

const ALL_PHOTOS_LIMIT = 60;

export const getGalleryView = cache(async (slug: string, rawQuery: string | null): Promise<GalleryView | null> => {
  if (listDemoEvents().some((e) => e.slug === slug)) return demoView(slug, rawQuery);
  return supabaseView(slug, rawQuery);
});

function demoView(slug: string, rawQuery: string | null): GalleryView | null {
  const g = getDemoGallery(slug, rawQuery);
  if (!g) return null;
  return {
    event: {
      slug: g.event.slug,
      name: g.event.name,
      entryLabel: g.event.entryLabel,
      organiser: g.event.organiser,
      venue: g.event.venue,
      startDate: g.event.startDate,
      isDemo: true,
    },
    photographerNames: g.photographers.map((p) => p.displayName),
    numbers: g.entries.map((e) => e.number),
    query: g.query,
    matchedEntry: g.matchedEntry
      ? {
          number: g.matchedEntry.number,
          competitors: g.matchedEntry.competitors,
          vehicle: g.matchedEntry.vehicle ?? null,
          className: g.matchedEntry.className ?? null,
        }
      : null,
    photos: g.photos.map(({ photo, photographer, entries }) => ({
      id: photo.id,
      imageUrl: null,
      demoPreview: photo.preview,
      numbers: entries.map((e) => e.number),
      photographerName: photographer.displayName,
      credit: photographer.credit,
      location: photo.location,
      takenAt: photo.takenAt,
      pricePence: photo.pricePence,
    })),
    truncated: false,
  };
}

interface SearchRow {
  photo_id: string;
  object_key: string;
  captured_at: string | null;
  location: string;
  price_pence: number;
  photographer_name: string;
  photographer_credit: string;
  numbers: string[];
}

async function supabaseView(slug: string, rawQuery: string | null): Promise<GalleryView | null> {
  const supabase = createSupabasePublicClient();
  if (!supabase) return null;

  const { data: event, error } = await supabase
    .from("events")
    .select("id, slug, name, entry_label, organiser, venue, start_date")
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle();
  if (error) throw new Error(`Could not load event: ${error.message}`);
  if (!event) return null;

  const query = normaliseEntryNumber(rawQuery);

  const [numbersRes, membersRes, entryRes] = await Promise.all([
    supabase.rpc("public_event_numbers", { p_event_slug: slug }),
    supabase
      .from("event_photographers")
      .select("photographers(display_name)")
      .eq("event_id", event.id)
      .eq("status", "approved"),
    query
      ? supabase
          .from("entries")
          .select("number, competitors, vehicle, class_name")
          .eq("event_id", event.id)
          .eq("number", query)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (numbersRes.error) throw new Error(numbersRes.error.message);

  const entry = entryRes.data as { number: string; competitors: string[]; vehicle: string | null; class_name: string | null } | null;

  let rows: SearchRow[] = [];
  if (!query || entry) {
    const { data, error: searchError } = await supabase.rpc("search_event_photos", {
      p_event_slug: slug,
      p_number: query,
      p_limit: query ? 500 : ALL_PHOTOS_LIMIT + 1,
    });
    if (searchError) throw new Error(searchError.message);
    rows = (data ?? []) as SearchRow[];
  }
  const truncated = !query && rows.length > ALL_PHOTOS_LIMIT;
  if (truncated) rows = rows.slice(0, ALL_PHOTOS_LIMIT);

  const storage = getStorage();
  const photos = await Promise.all(
    rows.map(async (r) => ({
      id: r.photo_id,
      imageUrl: storage ? await presignView(storage, r.object_key) : null,
      demoPreview: null,
      numbers: r.numbers,
      photographerName: r.photographer_name,
      credit: r.photographer_credit,
      location: r.location,
      takenAt: r.captured_at,
      pricePence: r.price_pence,
    })),
  );

  type MemberRow = { photographers: { display_name: string } | { display_name: string }[] | null };
  const photographerNames = ((membersRes.data ?? []) as MemberRow[])
    .flatMap((m) => (Array.isArray(m.photographers) ? m.photographers : m.photographers ? [m.photographers] : []))
    .map((p) => p.display_name)
    .sort();

  return {
    event: {
      slug: event.slug,
      name: event.name,
      entryLabel: event.entry_label,
      organiser: event.organiser,
      venue: event.venue,
      startDate: event.start_date,
      isDemo: false,
    },
    photographerNames,
    numbers: ((numbersRes.data ?? []) as { number: string }[])
      .map((n) => n.number)
      .sort((a, b) => a.localeCompare(b, "en-GB", { numeric: true }) || a.length - b.length),
    query,
    matchedEntry: entry
      ? { number: entry.number, competitors: entry.competitors, vehicle: entry.vehicle, className: entry.class_name }
      : null,
    photos,
    truncated,
  };
}

export async function listPublicEvents(): Promise<{ slug: string; name: string; venue: string; startDate: string; isDemo: boolean }[]> {
  const demoEvents = listDemoEvents().map((e) => ({ slug: e.slug, name: e.name, venue: e.venue, startDate: e.startDate, isDemo: true }));
  const supabase = createSupabasePublicClient();
  if (!supabase) return demoEvents;
  const { data, error } = await supabase
    .from("events")
    .select("slug, name, venue, start_date")
    .eq("is_public", true)
    .order("start_date", { ascending: false });
  if (error) {
    console.error("Could not list events", error.message);
    return demoEvents;
  }
  return [
    ...(data ?? []).map((e) => ({ slug: e.slug, name: e.name, venue: e.venue, startDate: e.start_date, isDemo: false })),
    ...demoEvents,
  ];
}
