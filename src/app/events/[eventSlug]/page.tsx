import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoPlaceholder } from "@/components/PhotoPlaceholder";
import { ShareButton } from "@/components/ShareButton";
import { formatPence } from "@/lib/gallery";
import { getGalleryView } from "@/lib/server/gallery-view";

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
  const gallery = await getGalleryView(eventSlug, carParam(await searchParams));
  if (!gallery) return { title: "Event not found" };
  const { event, query } = gallery;
  const title = query ? `${event.entryLabel} ${query} – ${event.name} photos` : `${event.name} photos`;
  return {
    title,
    description: `Photos from every photographer at ${event.name}.${event.isDemo ? " Demo data." : ""}`,
  };
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export default async function EventGalleryPage({ params, searchParams }: Props) {
  const { eventSlug } = await params;
  const gallery = await getGalleryView(eventSlug, carParam(await searchParams));
  if (!gallery) notFound();

  const { event, photographerNames, numbers, query, matchedEntry, photos, truncated } = gallery;
  const label = event.entryLabel;
  const basePath = `/events/${event.slug}`;
  const photographerCount = new Set(photos.map((p) => p.photographerName)).size;
  const dateText = new Date(event.startDate).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="page">
      {event.isDemo ? (
        <div className="demo-banner" role="note">
          <strong>Demo data</strong> – fictional event, crews and photographers. Prices are illustrative only and nothing
          can be bought yet.
        </div>
      ) : (
        <div className="demo-banner pilot-banner" role="note">
          <strong>Pilot</strong> – browse and find your photos. Buying opens after the pilot.
        </div>
      )}

      <header className="event-header">
        <Link href="/" className="back-link">← All events</Link>
        <h1>{event.name}</h1>
        <p className="event-meta">
          {dateText}
          {event.venue ? ` · ${event.venue}` : ""}
        </p>
        {event.organiser && <p className="event-meta">Organised by {event.organiser}</p>}
        {photographerNames.length > 0 && (
          <p className="event-meta">Photographers: {photographerNames.join(", ")}</p>
        )}
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
        {numbers.length > 0 && (
          <nav aria-label={`${label} numbers with photos`} className="entry-chips">
            {numbers.map((n) => (
              <Link
                key={n}
                href={`${basePath}?car=${encodeURIComponent(n)}`}
                className={`chip${matchedEntry?.number === n ? " chip-active" : ""}`}
                aria-current={matchedEntry?.number === n ? "page" : undefined}
              >
                {n}
              </Link>
            ))}
          </nav>
        )}
      </section>

      <section aria-live="polite" className="results">
        {query && matchedEntry && (
          <div className="results-summary">
            <div>
              <h2>
                {label} {matchedEntry.number}
              </h2>
              {(matchedEntry.competitors.length > 0 || matchedEntry.vehicle) && (
                <p>
                  {matchedEntry.competitors.join(" / ")}
                  {matchedEntry.vehicle ? `${matchedEntry.competitors.length ? " · " : ""}${matchedEntry.vehicle}` : ""}
                  {matchedEntry.className ? ` · ${matchedEntry.className}` : ""}
                </p>
              )}
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

        {query && matchedEntry && photos.length === 0 && (
          <div className="no-results" data-testid="no-photos-yet">
            <h2>No photos of {label.toLowerCase()} {matchedEntry.number} yet</h2>
            <p>Photographers are still adding and tagging photos. Check back later.</p>
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
              <h2>{truncated ? "Latest photos" : "All photos"}</h2>
              <p className="results-count" data-testid="results-count">
                {truncated
                  ? `Showing the latest ${photos.length}. Search for your ${label.toLowerCase()} number to see all of yours.`
                  : `${photos.length} ${photos.length === 1 ? "photo" : "photos"} from ${photographerCount} ${photographerCount === 1 ? "photographer" : "photographers"}`}
              </p>
            </div>
            <div className="results-actions">
              <ShareButton title={event.name} />
            </div>
          </div>
        )}

        {photos.length > 0 && (
          <ul className="photo-grid">
            {photos.map((p) => (
              <li key={p.id} className="photo-card" data-testid="photo-card" data-cars={p.numbers.join(",")}>
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed R2 URLs, no image optimiser needed
                  <img
                    src={p.imageUrl}
                    alt={`${label} ${p.numbers.join(" and ") || "photo"}${p.location ? ` at ${p.location}` : ""}, by ${p.photographerName}`}
                    loading="lazy"
                    className="photo-img"
                  />
                ) : p.demoPreview ? (
                  <PhotoPlaceholder
                    preview={p.demoPreview}
                    numbers={p.numbers}
                    label={`Placeholder for a photo of ${label.toLowerCase()} ${p.numbers.join(" and ")} at ${p.location}`}
                  />
                ) : (
                  <div className="photo-img photo-missing">Image unavailable</div>
                )}
                <div className="photo-body">
                  {p.numbers.length > 0 && (
                    <p className="photo-cars">
                      {p.numbers.map((n) => (
                        <span key={n} className="car-badge">
                          {label} {n}
                        </span>
                      ))}
                    </p>
                  )}
                  {(p.location || p.takenAt) && (
                    <p className="photo-location">
                      {[p.location, p.takenAt ? timeFmt.format(new Date(p.takenAt)) : null].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="photo-credit" data-testid="photo-credit">
                    📷 {p.credit}
                  </p>
                  <div className="photo-buy">
                    <span className="price">
                      {formatPence(p.pricePence)}
                      {event.isDemo && <span className="price-note"> demo price</span>}
                    </span>
                    <button type="button" className="buy-button" disabled title="Checkout comes after the pilot">
                      Buy – coming soon
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="page-footer">
        Photographers set their own prices and keep credit for their work.
        {event.isDemo ? " Sample gallery – all data is fictional." : ""}
      </footer>
    </main>
  );
}
