import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { adminPageGuard } from "@/lib/server/admin-page";
import { fetchAll } from "@/lib/server/fetch-all";
import { DeleteEntryButton, EntryImport, EventForm, PublicSwitch } from "../../components";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin – event" };

type EventRow = {
  id: string;
  slug: string;
  name: string;
  start_date: string;
  end_date: string;
  venue: string;
  organiser: string;
  sport: string;
  entry_label: string;
  location_label: string;
  is_public: boolean;
};
type EntryRow = { id: string; number: string; competitors: string[]; vehicle: string | null; class_name: string | null };
type PhotoRow = { id: string; photographer_id: string; upload_status: string; published_at: string | null };
type MemberRow = { photographer_id: string; status: string };

const byNumber = (a: { number: string }, b: { number: string }) =>
  a.number.localeCompare(b.number, "en-GB", { numeric: true }) || a.number.length - b.number.length;

export default async function AdminEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const admin = await adminPageGuard(`/admin/events/${eventId}`);
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) notFound();

  const { data: event } = await admin
    .from("events")
    .select("id, slug, name, start_date, end_date, venue, organiser, sport, entry_label, location_label, is_public")
    .eq("id", eventId)
    .maybeSingle<EventRow>();
  if (!event) notFound();

  const [entries, photos, tags, members] = await Promise.all([
    fetchAll<EntryRow>((a, b) => admin.from("entries").select("id, number, competitors, vehicle, class_name").eq("event_id", eventId).range(a, b)),
    fetchAll<PhotoRow>((a, b) =>
      admin.from("photos").select("id, photographer_id, upload_status, published_at").eq("event_id", eventId).range(a, b),
    ),
    fetchAll<{ photo_id: string; entry_id: string }>((a, b) => admin.from("photo_tags").select("photo_id, entry_id").eq("event_id", eventId).range(a, b)),
    fetchAll<MemberRow>((a, b) => admin.from("event_photographers").select("photographer_id, status").eq("event_id", eventId).range(a, b)),
  ]);
  entries.sort(byNumber);

  const photographerIds = [...new Set([...members.map((m) => m.photographer_id), ...photos.map((p) => p.photographer_id)])];
  const { data: photographers } = photographerIds.length
    ? await admin.from("photographers").select("id, display_name").in("id", photographerIds)
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map((photographers ?? []).map((p: { id: string; display_name: string }) => [p.id, p.display_name]));

  const taggedPhotoIds = new Set(tags.map((t) => t.photo_id));
  const tagsPerEntry = new Map<string, number>();
  tags.forEach((t) => tagsPerEntry.set(t.entry_id, (tagsPerEntry.get(t.entry_id) ?? 0) + 1));

  const stats = (rows: PhotoRow[]) => ({
    uploaded: rows.filter((p) => p.upload_status === "ready").length,
    live: rows.filter((p) => p.published_at).length,
    tagged: rows.filter((p) => taggedPhotoIds.has(p.id)).length,
    problems: rows.filter((p) => p.upload_status !== "ready").length,
  });
  const total = stats(photos);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = `${proto}://${host}/events/${event.slug}`;

  return (
    <main className="page">
      <Link href="/admin" className="back-link">← Events</Link>
      <h1>{event.name}</h1>

      <section className="panel">
        <h2>Gallery</h2>
        <PublicSwitch eventId={event.id} isPublic={event.is_public} url={shareUrl} />
      </section>

      <section className="panel">
        <h2>Photos</h2>
        <div className="stat-row" data-testid="photo-stats">
          <span>
            <strong>{total.uploaded}</strong> uploaded
          </span>
          <span>
            <strong>{total.live}</strong> live
          </span>
          <span>
            <strong>{total.tagged}</strong> tagged
          </span>
          <span>
            <strong>{total.uploaded - total.tagged}</strong> untagged
          </span>
        </div>
        {photographerIds.length > 0 ? (
          <div className="table-wrap">
            <table className="entry-table">
              <thead>
                <tr>
                  <th>Photographer</th>
                  <th>Access</th>
                  <th>Uploaded</th>
                  <th>Live</th>
                  <th>Tagged</th>
                </tr>
              </thead>
              <tbody>
                {photographerIds.map((id) => {
                  const s = stats(photos.filter((p) => p.photographer_id === id));
                  const status = members.find((m) => m.photographer_id === id)?.status ?? "—";
                  return (
                    <tr key={id}>
                      <td>{nameOf.get(id) ?? "Unknown"}</td>
                      <td>{status === "approved" ? "Approved" : status === "pending" ? "Pending" : status === "suspended" ? "Paused" : status}</td>
                      <td>{s.uploaded}</td>
                      <td>{s.live}</td>
                      <td>{s.tagged}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No photographers at this event yet.</p>
        )}
      </section>

      <section className="panel">
        <h2>Entry list ({entries.length} cars)</h2>
        <EntryImport
          eventId={event.id}
          existing={entries.map((e) => ({ number: e.number, competitors: e.competitors, vehicle: e.vehicle, className: e.class_name }))}
        />
        {entries.length > 0 && (
          <div className="table-wrap">
            <table className="entry-table" data-testid="entry-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Crew</th>
                  <th>Car</th>
                  <th>Class</th>
                  <th>Photos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="num">{e.number}</td>
                    <td>{e.competitors.join(" / ")}</td>
                    <td>{e.vehicle}</td>
                    <td>{e.class_name}</td>
                    <td>{tagsPerEntry.get(e.id) ?? 0}</td>
                    <td>
                      <DeleteEntryButton eventId={event.id} entryId={e.id} number={e.number} taggedPhotos={tagsPerEntry.get(e.id) ?? 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Event details</h2>
        <EventForm
          values={{
            id: event.id,
            name: event.name,
            slug: event.slug,
            isPublic: event.is_public,
            start_date: event.start_date,
            end_date: event.end_date,
            venue: event.venue,
            organiser: event.organiser,
            sport: event.sport,
            entry_label: event.entry_label,
            location_label: event.location_label,
          }}
        />
      </section>
    </main>
  );
}
