import Link from "next/link";
import { listPublicEvents } from "@/lib/server/gallery-view";

export const dynamic = "force-dynamic";

export default async function Home() {
  const events = await listPublicEvents();
  return (
    <main className="page">
      <header className="home-header">
        <h1>Rally Photos</h1>
        <p>One link per event. Find your car in every photographer’s pictures.</p>
      </header>
      <ul className="event-list">
        {events.map((e) => (
          <li key={e.slug}>
            <Link href={`/events/${e.slug}`} className="event-card">
              <span className="event-card-name">
                {e.name}
                {e.isDemo && <span className="tag-demo">Demo</span>}
              </span>
              <span className="event-card-meta">
                {[e.venue, new Date(e.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="event-card-cta">Open gallery →</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="page-footer">
        <Link href="/photographer">Photographer sign-in</Link>
      </p>
    </main>
  );
}
