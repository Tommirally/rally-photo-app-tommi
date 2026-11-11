"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseEntryList, slugify } from "@/lib/admin/entry-csv";
import { generatePassword, isValidEmail } from "@/lib/admin/password";
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

// ---------------------------------------------------------------------
// Photographers
// ---------------------------------------------------------------------

export type AddPhotographerState = (FormState & { password?: string; email?: string }) | null;

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Find a login by email (the admin API has no email filter; fine at pilot scale). */
async function findUserId(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureProfile(admin: SupabaseClient, userId: string, name: string, credit: string): Promise<string> {
  const { data: existing } = await admin.from("photographers").select("id").eq("user_id", userId).maybeSingle();
  if (existing) return existing.id as string;
  const base = slugify(name);
  const { data: taken } = await admin.from("photographers").select("slug").like("slug", `${base}%`);
  const used = new Set((taken ?? []).map((r: { slug: string }) => r.slug));
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  const { data, error } = await admin
    .from("photographers")
    .insert({ user_id: userId, slug, display_name: name, credit })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/**
 * Add a photographer to an event, creating their login if needed.
 *  - method "password": creates the login now and returns a temporary password
 *    to send them (works without any email setup).
 *  - method "invite": Supabase emails them a link to set their own password
 *    (needs an email service connected to Supabase for outside addresses).
 */
export async function addPhotographer(eventId: string, _prev: AddPhotographerState, form: FormData): Promise<AddPhotographerState> {
  const admin = await requireAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const credit = String(form.get("credit") ?? "").trim().slice(0, 160) || `© ${name}`;
  const method = form.get("method") === "invite" ? "invite" : "password";
  if (!isValidEmail(email)) return { error: "Enter a valid email address." };
  if (!name) return { error: "Enter the name to show on their photos." };

  try {
    let userId = await findUserId(admin, email);
    let password: string | undefined;
    let note: string;
    if (userId) {
      note = `${email} already has a login – added to this event.`;
    } else if (method === "invite") {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${await siteOrigin()}/auth/welcome` });
      if (error) {
        return {
          error: `The invite email couldn't be sent (${error.message}). Use “Create login now” instead, or connect an email service to Supabase (see README).`,
        };
      }
      userId = data.user.id;
      note = `Invite email sent to ${email}. They'll choose their own password.`;
    } else {
      password = generatePassword();
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return { error: `Couldn't create the login: ${error.message}` };
      userId = data.user.id;
      note = `Login created for ${email}. Send them the password below – it's only shown once.`;
    }

    const photographerId = await ensureProfile(admin, userId, name, credit);
    const { error } = await admin
      .from("event_photographers")
      .upsert({ event_id: eventId, photographer_id: photographerId, status: "approved" }, { onConflict: "event_id,photographer_id" });
    if (error) return { error: error.message };
    revalidatePath(`/admin/events/${eventId}`);
    return { ok: note, password, email };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Add someone who already works with us to another event. */
export async function addExistingPhotographer(eventId: string, photographerId: string): Promise<FormState> {
  const admin = await requireAdmin();
  const { error } = await admin
    .from("event_photographers")
    .upsert({ event_id: eventId, photographer_id: photographerId, status: "approved" }, { onConflict: "event_id,photographer_id" });
  if (error) return { error: error.message };
  revalidatePath(`/admin/events/${eventId}`);
  return { ok: "Added." };
}

export async function setPhotographerAccess(eventId: string, photographerId: string, status: "approved" | "suspended"): Promise<FormState> {
  const admin = await requireAdmin();
  if (status !== "approved" && status !== "suspended") return { error: "Unknown status" };
  const { error } = await admin
    .from("event_photographers")
    .update({ status })
    .eq("event_id", eventId)
    .eq("photographer_id", photographerId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/events/${eventId}`);
  return { ok: status === "approved" ? "Access restored." : "Access paused." };
}
