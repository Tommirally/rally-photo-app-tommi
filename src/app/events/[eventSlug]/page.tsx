import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoPlaceholder } from "@/components/PhotoPlaceholder";
import { ShareButton } from "@/components/ShareButton";
import { formatPence, getGallery } from "@/lib/gallery";

type Props = {
  params: Promise<{ eventSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** The car filter lives in the URL as ?car=32 so results can be shared. */
function carParam(sp: { [key: string]: string | string[] | undefined }): string | null {
  const v = sp.car;
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { eventSlug } = await params;
  const gallery = getGallery(eventSlug, carParam(await searchParams));
  if (!gallery) return { title: "Event not found" };
  const { event, query } = gallery;
  const title = query ? `${event.entryLabel} ${query} – ${event.name} photos` : `${event.name} photos`;
  return { title, description: `Photos from every photographer at ${event.name}. Demo data.` };
}

export default async function EventGalleryPage({ params, searchParams }: Props) {
  const { eventSlug } = await params;
  const gallery = getGallery(eventSlug, carParam(await searchParams));
  if (!gallery) notFound();

  const { event, photographers, entries, query, matchedEntry, photos } = gallery;
  const label = event.entryLabel;
  const basePath = `/events/${event.slug}`;
  const photographerCount = new Set(photos.map((p) => p.photographer.id)).size;
  const dateText = new Date(event.startDate).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="page">
      <div className="demo-banner" role="note">
        <strong>Demo data</strong> – fictional event, crews and photographers. Prices are illustrative only and nothing can be bought yet.
      </div>

      <header className="event-header">
        <Link href="/" className="back-link">← All events</Link>
        <h1>{event.name}</h1>
        <p className="event-meta">
          {dateText} · {event.venue}
        </p>
        <p className="event-meta">Organised by {event.organiser}</p>
        <p className="event-meta">
          Photographers: {photographers.map((p) => p.displayName).join(" and ")}
        </p>
      </header>

      <section className="search-panel" aria-labelledby="search-heading">
        <h2 id="search-heading">Find your {label.toLowerCase()}</h2>
        {/* Plain GET form: works without JavaScript and puts ?car= in the URL. */}
        <form method="get" action={basePath} className="search-form" role="search">
          <label htmlFor="car" className="visually-hidden">
            {label} number
          </label>
          <input
            id="car"
            name="car"
            type="search"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            placeholder={`${label} number, e.g. 32`}
            defaultValue={query ?? ""}
            className="search-input"
          />
          <button type="submit" className="search-button">Search</button>
        </form>
        <p className="search-hint">Type the number exactly as it appears on the car. 32, 032 and 320 are different cars.</p>
        <nav aria-label={`${label} numbers`} className="entry-chips">
          {entries.map((e) => (
            <Link
              key={e.id}
              href={`${basePath}?car=${encodeURIComponent(e.number)}`}
              className={`chip${matchedEntry?.id === e.id ? " chip-active" : ""}`}
              aria-current={matchedEntry?.id === e.id ? "page" : undefined}
            >
              {e.number}
            </Link>
          ))}
        </nav>
      </section>

      <section aria-live="polite" className="results">
        {query && matchedEntry && (
          <div className="results-summary">
            <div>
              <h2>
                {label} {matchedEntry.number}
              </h2>
              <p>
                {matchedEntry.competitors.join(" / ")}
                {matchedEntry.vehicle ? ` · ${matchedEntry.vehicle}` : ""}
                {matchedEntry.className ? ` · ${matchedEntry.className}` : ""}
              </p>
              <p className="results-count" data-testid="results-count">
                {photos.length} {photos.length === 1 ? "photo" : "photos"} from {photographerCount}{" "}
                {photographerCount === 1 ? "photographer" : "photographers"}
              </p>
            </div>
            <div className="results-actions">
              <ShareButton title={`${label} ${matchedEntry.number} – ${event.name}`} />
              <Link href={basePath} className="clear-link">Show all photos</Link>
            </div>
          </div>
        )}

        {query && !matchedEntry && (
          <div className="no-results" data-testid="no-results">
            <h2>No {label.toLowerCase()} {query} at this event</h2>
            <p>Check the number on the door, or tap one of the numbers above.</p>
            <Link href={basePath} className="clear-link">Show all photos</Link>
          </div>
        )}

        {!query && (
          <div className="results-summary">
            <div>
              <h2>All photos</h2>
              <p className="results-count" data-testid="results-count">
                {photos.length} photos from {photographerCount} photographers
              </p>
            </div>
            <div className="results-actions">
              <ShareButton title={event.name} />
            </div>
          </div>
        )}

        {photos.length > 0 && (
          <ul className="photo-grid">
            {photos.map(({ photo, photographer, entries: tagged }) => {
              const numbers = tagged.map((e) => e.number);
              return (
                <li key={photo.id} className="photo-card" data-testid="photo-card" data-cars={numbers.join(",")}>
                  <PhotoPlaceholder
                    preview={photo.preview}
                    numbers={numbers}
                    label={`Placeholder for a photo of ${label.toLowerCase()} ${numbers.join(" and ")} at ${photo.location}`}
                  />
                  <div className="photo-body">
                    <p className="photo-cars">
                      {numbers.map((n) => (
                        <span key={n} className="car-badge">
                          {label} {n}
                        </span>
                      ))}
                    </p>
                    <p className="photo-location">
                      {photo.location} ·{" "}
                      {new Date(photo.takenAt).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Europe/London",
                      })}
                    </p>
                    <p className="photo-credit" data-testid="photo-credit">
                      📷 {photographer.credit}
                    </p>
                    <div className="photo-buy">
                      <span className="price">
                        {formatPence(photo.pricePence)}
                        <span className="price-note"> demo price</span>
                      </span>
                      <button type="button" className="buy-button" disabled title="Checkout comes after the pilot">
                        Buy – coming soon
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="page-footer">
        Photographers set their own prices and keep credit for their work. Sample gallery – all data is fictional.
      </footer>
    </main>
  );
}
