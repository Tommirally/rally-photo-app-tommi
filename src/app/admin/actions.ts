"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseEntryList, slugify } from "@/lib/admin/entry-csv";
import { requireAdmin } from "@/lib/server/admin";

export type FormState = { error?: string; ok?: string } | null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function readEventForm(form: FormData) {
  const text = (k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
  const startDate = text("start_date", 10);
  const endDate = text("end_date", 10) || startDate;
  const fields = {
    name: text("name"),
    start_date: startDate,
    end_date: endDate,
    venue: text("venue"),
    organiser: text("organiser"),
    sport: text("sport", 40) || "rally",
    entry_label: text("entry_label", 40) || "Car",
    location_label: text("location_label", 40) || "Stage",
  };
  if (!fields.name) return { error: "Give the event a name." };
  if (!DATE_RE.test(startDate) || Number.isNaN(Date.parse(startDate))) return { error: "Choose the event date." };
  if (!DATE_RE.test(endDate) || endDate < startDate) return { error: "The end date can't be before the start date." };
  return { fields };
}

export async function createEvent(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = readEventForm(form);
  if ("error" in parsed) return { error: parsed.error };

  // Pick a free web address: name, then name-2, name-3…
  const base = slugify(parsed.fields.name);
  const { data: taken } = await admin.from("events").select("slug").like("slug", `${base}%`);
  const used = new Set((taken ?? []).map((r: { slug: string }) => r.slug));
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;

  const { data, error } = await admin
    .from("events")
    .insert({ ...parsed.fields, slug, is_public: false })
    .select("id")
    .single();
  if (error) return { error: `Could not create the event: ${error.message}` };
  revalidatePath("/admin");
  redirect(`/admin/events/${data.id}`);
}

export async function updateEvent(eventId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = readEventForm(form);
  if ("error" in parsed) return { error: parsed.error };
  const update: Record<string, unknown> = { ...parsed.fields };

  const newSlug = String(form.get("slug") ?? "").trim();
  if (newSlug) {
    const { data: current } = await admin.from("events").select("slug, is_public").eq("id", eventId).single();
    if (current && newSlug !== current.slug) {
      if (current.is_public) return { error: "The web address can't change once the gallery is public (shared links would break)." };
      if (!SLUG_RE.test(newSlug)) return { error: "Web address: lower-case letters, numbers and dashes only." };
      update.slug = newSlug;
    }
  }
  const { error } = await admin.from("events").update(update).eq("id", eventId);
  if (error) {
    return { error: error.code === "23505" ? "That web address is already used by another event." : `Could not save: ${error.message}` };
  }
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin");
  return { ok: "Saved." };
}

export async function setEventPublic(eventId: string, isPublic: boolean): Promise<FormState> {
  const admin = await requireAdmin();
  const { error } = await admin.from("events").update({ is_public: isPublic }).eq("id", eventId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin");
  return { ok: isPublic ? "The gallery is public." : "The gallery is hidden." };
}

/**
 * Save an entry list. The server re-reads the CSV with the same rules as the
 * preview, so nothing that failed the checks can be saved. Existing cars with
 * the same number are updated; cars not in the file are left alone.
 */
export async function importEntries(eventId: string, csvText: string): Promise<FormState & { added?: number; updated?: number }> {
  const admin = await requireAdmin();
  if (csvText.length > 2_000_000) return { error: "The file is too big." };
  const result = parseEntryList(csvText);
  if (result.problems.length) return { error: `Fix the file first: ${result.problems[0]}` };

  const { data: existing, error: readError } = await admin.from("entries").select("number").eq("event_id", eventId);
  if (readError) return { error: readError.message };
  const before = new Set((existing ?? []).map((e: { number: string }) => e.number));

  const { error } = await admin.from("entries").upsert(
    result.entries.map((e) => ({
      event_id: eventId,
      number: e.number,
      competitors: e.competitors,
      vehicle: e.vehicle,
      class_name: e.className,
    })),
    { onConflict: "event_id,number" },
  );
  if (error) return { error: `Could not save the entry list: ${error.message}` };

  const added = result.entries.filter((e) => !before.has(e.number)).length;
  const updated = result.entries.length - added;
  revalidatePath(`/admin/events/${eventId}`);
  return { ok: `Saved: ${added} new, ${updated} updated.`, added, updated };
}

export async function deleteEntry(eventId: string, entryId: string): Promise<FormState> {
  const admin = await requireAdmin();
  const { error } = await admin.from("entries").delete().eq("id", entryId).eq("event_id", eventId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/events/${eventId}`);
  return { ok: "Car removed." };
}
