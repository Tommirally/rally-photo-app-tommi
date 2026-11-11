import Link from "next/link";
import { listEvents } from "@/lib/gallery";

export default function Home() {
  const events = listEvents();
  return (
    <main className="page">
      <div className="demo-banner" role="note">
        <strong>Demo</strong> – fictional events, photographers and illustrative prices. Nothing is for sale yet.
      </div>
      <header className="home-header">
        <h1>Rally Photos</h1>
        <p>One link per event. Find your car in every photographer’s pictures.</p>
      </header>
      <ul className="event-list">
        {events.map((e) => (
          <li key={e.id}>
            <Link href={`/events/${e.slug}`} className="event-card">
              <span className="event-card-name">{e.name}</span>
              <span className="event-card-meta">
                {e.venue} · {new Date(e.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </span>
              <span className="event-card-cta">Open gallery →</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
