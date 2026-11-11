import Link from "next/link";
import { adminPageGuard } from "@/lib/server/admin-page";
import { EventForm } from "../../components";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin – new event" };

export default async function NewEventPage() {
  await adminPageGuard("/admin/events/new");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <main className="page narrow">
      <Link href="/admin" className="back-link">← Events</Link>
      <h1>New event</h1>
      <p className="muted">It starts as a draft. Add the entry list and photographers next, then make it public.</p>
      <EventForm
        values={{ name: "", start_date: today, end_date: today, venue: "", organiser: "", sport: "rally", entry_label: "Car", location_label: "Stage" }}
      />
    </main>
  );
}
