import Link from "next/link";
import { adminPageGuard } from "@/lib/server/admin-page";
import { fetchAll } from "@/lib/server/fetch-all";
import { SignOutButton } from "../photographer/SignOutButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin – events" };

type EventRow = { id: string; slug: string; name: string; start_date: string; is_public: boolean };

export default async function AdminHome() {
  const admin = await adminPageGuard("/admin");
  const [events, entries, photos] = await Promise.all([
    fetchAll<EventRow>((a, b) => admin.from("events").select("id, slug, name, start_date, is_public").order("start_date", { ascending: false }).range(a, b)),
    fetchAll<{ event_id: string }>((a, b) => admin.from("entries").select("event_id").range(a, b)),
    fetchAll<{ event_id: string; published_at: string | null }>((a, b) =>
      admin.from("photos").select("event_id, published_at").eq("upload_status", "ready").range(a, b),
    ),
  ]);
  const count = <T extends { event_id: string }>(rows: T[], id: string) => rows.filter((r) => r.event_id === id).length;

  return (
    <main className="page">
      <div className="topbar">
        <Link href="/" className="back-link">← Site</Link>
        <SignOutButton />
      </div>
      <div className="row spread">
        <h1>Events</h1>
        <Link href="/admin/events/new" className="primary-button">
          + New event
        </Link>
      </div>
      {events.length === 0 && <p>No events yet. Create the first one.</p>}
      <ul className="event-list">
        {events.map((e) => (
          <li key={e.id}>
            <Link href={`/admin/events/${e.id}`} className="event-card">
              <span className="event-card-name">
                {e.name} <span className={`badge ${e.is_public ? "badge-live" : ""}`}>{e.is_public ? "Public" : "Draft"}</span>
              </span>
              <span className="event-card-meta">
                {new Date(e.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                {count(entries, e.id)} cars · {count(photos, e.id)} photos
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
