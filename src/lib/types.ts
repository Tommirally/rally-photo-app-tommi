/**
 * Core domain model. These map 1:1 to the planned Supabase tables
 * (see PRODUCT_BRIEF.md). Keep them distinct:
 *
 *   Event ──< EventPhotographer >── Photographer
 *     │                                  │
 *     ├──< Entry                         │
 *     └──< Photo >───────────────────────┘
 *            └──< PhotoTag >── Entry
 *
 * - An event can have many photographers; a photographer can work many events.
 * - An entry is one numbered competitor at one event. Its number is TEXT
 *   ("32", "032" and "320" are different entries) and is only unique within
 *   its event.
 * - A photo belongs to one event and one photographer, and can be tagged
 *   with any number of that event's entries.
 */

/** Sport-agnostic event. Rally today; other numbered sports later. */
export interface Event {
  id: string;
  slug: string;
  name: string;
  /** e.g. "rally", later "motocross", "enduro", "running". */
  sport: string;
  /** What a numbered competitor is called at this event: "Car", "Bike", "Runner"… */
  entryLabel: string;
  /** e.g. "Stage" for rallies, "Lap"/"Section" elsewhere. */
  locationLabel: string;
  organiser: string;
  venue: string;
  /** ISO dates, e.g. "2026-03-14". */
  startDate: string;
  endDate: string;
}

export interface Photographer {
  id: string;
  slug: string;
  displayName: string;
  /** Short credit line shown on every photo. */
  credit: string;
  website?: string;
}

/** Many-to-many: which photographers are covering which events. */
export interface EventPhotographer {
  eventId: string;
  photographerId: string;
}

/** One numbered competitor at one event. */
export interface Entry {
  id: string;
  eventId: string;
  /** Text, never a number: leading zeros and letters are meaningful. */
  number: string;
  /** Driver / co-driver, rider, runner… */
  competitors: string[];
  vehicle?: string;
  className?: string;
}

/** Placeholder artwork settings for the demo (real photos come from R2 later). */
export interface DemoPreview {
  scene: "forest" | "gravel" | "tarmac" | "dusk";
  carColour: string;
}

export interface Photo {
  id: string;
  eventId: string;
  photographerId: string;
  /** Where on the event it was taken, e.g. "SS3 Kielder North". */
  location: string;
  /** ISO timestamp. */
  takenAt: string;
  /** Price set by the photographer, in pence (GBP). */
  pricePence: number;
  preview: DemoPreview;
}

/** Many-to-many: one photo can show several entries. */
export interface PhotoTag {
  photoId: string;
  entryId: string;
}
