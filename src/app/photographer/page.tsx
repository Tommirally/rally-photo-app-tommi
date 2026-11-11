import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getPhotographerSession } from "@/lib/server/supabase";
import { SignOutButton } from "./SignOutButton";

export const metadata = { title: "My events" };
export const dynamic = "force-dynamic";

type Membership = { event_id: string; status: string };
type EventRow = { id: string; slug: string; name: string; start_date: string; is_public: boolean };

export default async function PhotographerHome() {
  if (!isSupabaseConfigured()) redirect("/login");
  const session = await getPhotographerSession();
  if (!session) redirect("/login");

  if (!session.photographer) {
    return (
      <main className="page narrow">
        <h1>Almost there</h1>
        <p>
          You’re signed in as {session.email}, but this account isn’t set up as a photographer yet. Ask the organiser to
          add you.
        </p>
        <SignOutButton />
      </main>
    );
  }

  const { data: memberships } = await session.supabase
    .from("event_photographers")
    .select("event_id, status")
    .eq("photographer_id", session.photographer.id);
  const eventIds = ((memberships ?? []) as Membership[]).map((m) => m.event_id);
  const { data: events } = eventIds.length
    ? await session.supabase.from("events").select("id, slug, name, start_date, is_public").in("id", eventIds)
    : { data: [] as EventRow[] };
  const eventById = new Map(((events ?? []) as EventRow[]).map((e) => [e.id, e]));

  return (
    <main className="page narrow">
      <div className="topbar">
        <span className="muted">Signed in as {session.photographer.display_name}</span>
        <SignOutButton />
      </div>
      <h1>My events</h1>
      {eventIds.length === 0 && <p>You haven’t been added to any events yet. Ask the organiser.</p>}
      <ul className="event-list">
        {((memberships ?? []) as Membership[]).map((m) => {
          const ev = eventById.get(m.event_id);
          const approved = m.status === "approved";
          return (
            <li key={m.event_id}>
              {approved && ev ? (
                <Link href={`/photographer/events/${ev.id}`} className="event-card">
                  <span className="event-card-name">{ev.name}</span>
                  <span className="event-card-meta">
                    {new Date(ev.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                    {" · "}
                    {ev.is_public ? "Gallery is live" : "Gallery not public yet"}
                  </span>
                  <span className="event-card-cta">Upload and tag →</span>
                </Link>
              ) : (
                <div className="event-card disabled">
                  <span className="event-card-name">{ev?.name ?? "Event"}</span>
                  <span className="event-card-meta">
                    {m.status === "pending" ? "Waiting for the organiser to approve you" : "Your access to this event is paused"}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
