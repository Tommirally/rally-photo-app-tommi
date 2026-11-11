/**
 * DEMO DATA ONLY. Every event, person, photographer and price here is
 * fictional and illustrative. Replaced by Supabase in the week-one pilot.
 */
import type {
  Entry,
  Event,
  EventPhotographer,
  Photo,
  Photographer,
  PhotoTag,
} from "./types";

export const events: Event[] = [
  {
    id: "evt-demo-forest-stages",
    slug: "demo-forest-stages-2026",
    name: "Demo Forest Stages Rally 2026",
    sport: "rally",
    entryLabel: "Car",
    locationLabel: "Stage",
    organiser: "Example Motor Club (fictional)",
    venue: "Fictional Forest, North England",
    startDate: "2026-03-14",
    endDate: "2026-03-14",
  },
];

export const photographers: Photographer[] = [
  {
    id: "pg-fernhollow",
    slug: "fern-hollow-photography",
    displayName: "Fern Hollow Photography",
    credit: "© Fern Hollow Photography (demo)",
  },
  {
    id: "pg-gravelline",
    slug: "gravel-line-images",
    displayName: "Gravel Line Images",
    credit: "© Gravel Line Images (demo)",
  },
];

export const eventPhotographers: EventPhotographer[] = [
  { eventId: "evt-demo-forest-stages", photographerId: "pg-fernhollow" },
  { eventId: "evt-demo-forest-stages", photographerId: "pg-gravelline" },
];

const EVT = "evt-demo-forest-stages";

export const entries: Entry[] = [
  { id: "ent-7", eventId: EVT, number: "7", competitors: ["A. Driver", "B. Navigator"], vehicle: "Ford Escort Mk2", className: "Historic" },
  { id: "ent-15", eventId: EVT, number: "15", competitors: ["C. Driver", "D. Navigator"], vehicle: "Subaru Impreza", className: "Class 4" },
  { id: "ent-32", eventId: EVT, number: "32", competitors: ["E. Driver", "F. Navigator"], vehicle: "Mitsubishi Lancer Evo IX", className: "Class 4" },
  { id: "ent-032", eventId: EVT, number: "032", competitors: ["G. Driver", "H. Navigator"], vehicle: "Peugeot 208 Rally4", className: "Class 3" },
  { id: "ent-320", eventId: EVT, number: "320", competitors: ["J. Driver", "K. Navigator"], vehicle: "Ford Fiesta R2", className: "Class 2" },
  { id: "ent-101", eventId: EVT, number: "101", competitors: ["L. Driver", "M. Navigator"], vehicle: "Vauxhall Nova", className: "Class 1" },
];

const FH = "pg-fernhollow";
const GL = "pg-gravelline";

export const photos: Photo[] = [
  // Car 32 — two photographers
  { id: "ph-01", eventId: EVT, photographerId: FH, location: "SS1 Fictional North", takenAt: "2026-03-14T09:12:00Z", pricePence: 800, preview: { scene: "forest", carColour: "#d62828" } },
  { id: "ph-02", eventId: EVT, photographerId: FH, location: "SS3 Example Ridge", takenAt: "2026-03-14T11:40:00Z", pricePence: 800, preview: { scene: "gravel", carColour: "#d62828" } },
  { id: "ph-03", eventId: EVT, photographerId: GL, location: "SS2 Demo Valley", takenAt: "2026-03-14T10:05:00Z", pricePence: 600, preview: { scene: "tarmac", carColour: "#d62828" } },
  { id: "ph-04", eventId: EVT, photographerId: GL, location: "SS4 Sample Pass", takenAt: "2026-03-14T14:22:00Z", pricePence: 750, preview: { scene: "dusk", carColour: "#d62828" } },
  // Car 032
  { id: "ph-05", eventId: EVT, photographerId: FH, location: "SS1 Fictional North", takenAt: "2026-03-14T09:20:00Z", pricePence: 800, preview: { scene: "forest", carColour: "#1d4ed8" } },
  { id: "ph-06", eventId: EVT, photographerId: GL, location: "SS2 Demo Valley", takenAt: "2026-03-14T10:12:00Z", pricePence: 600, preview: { scene: "tarmac", carColour: "#1d4ed8" } },
  // Car 320
  { id: "ph-07", eventId: EVT, photographerId: FH, location: "SS3 Example Ridge", takenAt: "2026-03-14T11:55:00Z", pricePence: 800, preview: { scene: "gravel", carColour: "#f59e0b" } },
  // Cars 7 and 15 in the same frame — one photo, two tags
  { id: "ph-08", eventId: EVT, photographerId: GL, location: "SS4 Sample Pass", takenAt: "2026-03-14T14:02:00Z", pricePence: 750, preview: { scene: "dusk", carColour: "#f1f5f9" } },
  // Car 7
  { id: "ph-09", eventId: EVT, photographerId: FH, location: "SS1 Fictional North", takenAt: "2026-03-14T09:03:00Z", pricePence: 800, preview: { scene: "forest", carColour: "#f1f5f9" } },
  // Car 15
  { id: "ph-10", eventId: EVT, photographerId: FH, location: "SS3 Example Ridge", takenAt: "2026-03-14T11:31:00Z", pricePence: 800, preview: { scene: "gravel", carColour: "#0ea5e9" } },
  // Car 101
  { id: "ph-11", eventId: EVT, photographerId: GL, location: "SS2 Demo Valley", takenAt: "2026-03-14T10:40:00Z", pricePence: 500, preview: { scene: "tarmac", carColour: "#16a34a" } },
];

export const photoTags: PhotoTag[] = [
  { photoId: "ph-01", entryId: "ent-32" },
  { photoId: "ph-02", entryId: "ent-32" },
  { photoId: "ph-03", entryId: "ent-32" },
  { photoId: "ph-04", entryId: "ent-32" },
  { photoId: "ph-05", entryId: "ent-032" },
  { photoId: "ph-06", entryId: "ent-032" },
  { photoId: "ph-07", entryId: "ent-320" },
  { photoId: "ph-08", entryId: "ent-7" },
  { photoId: "ph-08", entryId: "ent-15" },
  { photoId: "ph-09", entryId: "ent-7" },
  { photoId: "ph-10", entryId: "ent-15" },
  { photoId: "ph-11", entryId: "ent-101" },
];
