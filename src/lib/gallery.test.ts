import { describe, expect, it } from "vitest";
import { formatPence, getGallery, normaliseEntryNumber } from "./gallery";

const SLUG = "demo-forest-stages-2026";

function numbersIn(result: ReturnType<typeof getGallery>) {
  return new Set(result!.photos.flatMap((p) => p.entries.map((e) => e.number)));
}

describe("normaliseEntryNumber", () => {
  it("keeps leading zeros and trims spaces", () => {
    expect(normaliseEntryNumber(" 032 ")).toBe("032");
    expect(normaliseEntryNumber("32")).toBe("32");
    expect(normaliseEntryNumber("h12")).toBe("H12");
    expect(normaliseEntryNumber("   ")).toBeNull();
    expect(normaliseEntryNumber(undefined)).toBeNull();
  });
});

describe("car-number search", () => {
  it("seeds 32, 032 and 320 as separate entries", () => {
    const all = getGallery(SLUG)!;
    const nums = all.entries.map((e) => e.number);
    expect(nums).toEqual(expect.arrayContaining(["32", "032", "320"]));
    expect(new Set(all.entries.filter((e) => ["32", "032", "320"].includes(e.number)).map((e) => e.id)).size).toBe(3);
  });

  it("searching 32 shows only car 32, from both photographers", () => {
    const r = getGallery(SLUG, "32")!;
    expect(r.matchedEntry?.number).toBe("32");
    expect(r.photos.length).toBeGreaterThan(0);
    expect(numbersIn(r)).toEqual(new Set(["32"]));
    expect(new Set(r.photos.map((p) => p.photographer.displayName))).toEqual(
      new Set(["Fern Hollow Photography", "Gravel Line Images"]),
    );
  });

  it("searching 032 shows only car 032", () => {
    const r = getGallery(SLUG, "032")!;
    expect(r.matchedEntry?.number).toBe("032");
    expect(numbersIn(r)).toEqual(new Set(["032"]));
  });

  it("searching 320 shows only car 320", () => {
    const r = getGallery(SLUG, "320")!;
    expect(numbersIn(r)).toEqual(new Set(["320"]));
  });

  it("does not partially match", () => {
    for (const q of ["3", "2", "20", "03"]) {
      const r = getGallery(SLUG, q)!;
      expect(r.matchedEntry).toBeNull();
      expect(r.photos).toHaveLength(0);
    }
  });

  it("finds a photo tagged with several entries under each of them", () => {
    const seven = getGallery(SLUG, "7")!.photos.map((p) => p.photo.id);
    const fifteen = getGallery(SLUG, "15")!.photos.map((p) => p.photo.id);
    expect(seven).toContain("ph-08");
    expect(fifteen).toContain("ph-08");
  });

  it("shows every photo when there is no search", () => {
    expect(getGallery(SLUG)!.photos).toHaveLength(11);
    expect(getGallery(SLUG, "")!.photos).toHaveLength(11);
  });

  it("returns null for an unknown event", () => {
    expect(getGallery("nope", "32")).toBeNull();
  });
});

describe("formatPence", () => {
  it("formats GBP", () => {
    expect(formatPence(800)).toBe("£8.00");
  });
});
