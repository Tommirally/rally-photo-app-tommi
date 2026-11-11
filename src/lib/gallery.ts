/** Demo-data gallery (fictional sample event). Real events come from Supabase. */
import * as demo from "./demo-data";
import type { Entry, Event, Photo, Photographer } from "./types";

/** A photo joined with everything the gallery needs to display it. */
export interface GalleryPhoto {
  photo: Photo;
  photographer: Photographer;
  entries: Entry[];
}

export interface GalleryResult {
  event: Event;
  photographers: Photographer[];
  entries: Entry[];
  /** The cleaned-up search text, or null when not searching. */
  query: string | null;
  /** The entry that matched the search, if any. */
  matchedEntry: Entry | null;
  photos: GalleryPhoto[];
}

/**
 * Clean up what someone typed into the car-number box.
 * Removes spaces and upper-cases letters. Leading zeros are KEPT,
 * because "032" and "32" are different entries.
 * Must match public.normalise_entry_number() in the database.
 */
export function normaliseEntryNumber(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/\s+/g, "").toUpperCase();
  return cleaned === "" ? null : cleaned;
}

/** Exact text match within one event. Never a prefix or numeric match. */
export function findEntry(entries: Entry[], eventId: string, number: string): Entry | null {
  return entries.find((e) => e.eventId === eventId && e.number.toUpperCase() === number) ?? null;
}

export function getEventBySlug(slug: string): Event | null {
  return demo.events.find((e) => e.slug === slug) ?? null;
}

export function listEvents(): Event[] {
  return demo.events;
}

/** Everything the gallery page needs, optionally filtered to one entry number. */
export function getGallery(eventSlug: string, rawQuery?: string | null): GalleryResult | null {
  const event = getEventBySlug(eventSlug);
  if (!event) return null;

  const photographerIds = new Set(
    demo.eventPhotographers.filter((ep) => ep.eventId === event.id).map((ep) => ep.photographerId),
  );
  const photographers = demo.photographers.filter((p) => photographerIds.has(p.id));
  const entries = demo.entries
    .filter((e) => e.eventId === event.id)
    .sort((a, b) => a.number.localeCompare(b.number, "en-GB", { numeric: true }) || a.number.length - b.number.length);
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const photographerById = new Map(photographers.map((p) => [p.id, p]));

  const query = normaliseEntryNumber(rawQuery);
  const matchedEntry = query ? findEntry(entries, event.id, query) : null;

  const photos: GalleryPhoto[] = demo.photos
    .filter((p) => p.eventId === event.id && photographerById.has(p.photographerId))
    .map((photo) => ({
      photo,
      photographer: photographerById.get(photo.photographerId)!,
      entries: demo.photoTags
        .filter((t) => t.photoId === photo.id)
        .map((t) => entryById.get(t.entryId))
        .filter((e): e is Entry => e !== undefined),
    }))
    .filter((gp) => {
      if (!query) return true;
      if (!matchedEntry) return false;
      return gp.entries.some((e) => e.id === matchedEntry.id);
    })
    .sort((a, b) => a.photo.takenAt.localeCompare(b.photo.takenAt));

  return { event, photographers, entries, query, matchedEntry, photos };
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
export function formatPence(pence: number): string {
  return gbp.format(pence / 100);
}
