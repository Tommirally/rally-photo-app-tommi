import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readJpegInfo } from "./jpeg";
import { UPLOAD_LIMITS, checkFiles, sortByFilename } from "./limits";
import { MAX_ATTEMPTS, transferFile, type CompleteResult } from "./transfer";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(path.join(__dirname, "../../../tests/fixtures/photos", name)));

describe("readJpegInfo", () => {
  it("reads size and EXIF capture time without offset", () => {
    const r = readJpegInfo(fixture("car32-a.jpg"));
    expect(r).toEqual({
      ok: true,
      info: { width: 1200, height: 800, exifDateTimeOriginal: "2026:03:14 09:12:05", exifOffsetTimeOriginal: null },
    });
  });

  it("reads the EXIF time-zone offset when the camera wrote one", () => {
    const r = readJpegInfo(fixture("portrait-15.jpg"));
    expect(r.ok && r.info).toMatchObject({ width: 800, height: 1200, exifOffsetTimeOriginal: "+01:00" });
  });

  it("handles photos without EXIF", () => {
    const r = readJpegInfo(fixture("car32-c-noexif.jpg"));
    expect(r.ok && r.info.exifDateTimeOriginal).toBeNull();
  });

  it("rejects non-JPEG data even with a .jpg name", () => {
    expect(readJpegInfo(fixture("really-a-png.jpg"))).toEqual({ ok: false, reason: "not_jpeg" });
  });

  it("asks for more bytes when the header is cut short", () => {
    const r = readJpegInfo(fixture("car32-a.jpg").subarray(0, 40));
    expect(r).toEqual({ ok: false, reason: "needMoreBytes" });
  });
});

describe("checkFiles (browser pre-check)", () => {
  const jpg = (name: string, size = 1000) => ({ name, size, type: "image/jpeg" });

  it("accepts web-sized JPEGs and sorts them like the camera does", () => {
    const r = checkFiles([jpg("IMG_10.jpg"), jpg("IMG_2.JPG"), jpg("IMG_1.jpeg")]);
    expect(r.accepted.map((f) => f.name)).toEqual(["IMG_1.jpeg", "IMG_2.JPG", "IMG_10.jpg"]);
    expect(r.rejected).toHaveLength(0);
  });

  it("rejects non-JPEGs, empty files and files over the size limit", () => {
    const r = checkFiles([
      { name: "a.png", size: 10, type: "image/png" },
      { name: "b.jpg", size: 10, type: "image/png" },
      jpg("c.jpg", 0),
      jpg("d.jpg", UPLOAD_LIMITS.maxFileBytes + 1),
      jpg("e.jpg", UPLOAD_LIMITS.maxFileBytes),
    ]);
    expect(r.accepted.map((f) => f.name)).toEqual(["e.jpg"]);
    expect(r.rejected.map((x) => x.file.name)).toEqual(["a.png", "b.jpg", "c.jpg", "d.jpg"]);
  });

  it("caps a batch at the per-upload file limit", () => {
    const files = Array.from({ length: UPLOAD_LIMITS.maxFilesPerBatch + 5 }, (_, i) => jpg(`IMG_${i}.jpg`));
    const r = checkFiles(files);
    expect(r.accepted).toHaveLength(UPLOAD_LIMITS.maxFilesPerBatch);
    expect(r.rejected).toHaveLength(5);
  });

  it("natural-sorts names", () => {
    expect(sortByFilename([{ name: "x10" }, { name: "x9" }]).map((f) => f.name)).toEqual(["x9", "x10"]);
  });
});

describe("transferFile retries", () => {
  const blob = new Blob([new Uint8Array(10)], { type: "image/jpeg" });
  const sleep = vi.fn(async () => {});
  const ok = () => new Response(null, { status: 200 });

  function deps(fetchImpl: typeof fetch, complete: () => Promise<CompleteResult> = async () => ({ status: "ready" })) {
    return { fetch: fetchImpl, sleep, refreshUrl: vi.fn(async () => "https://fresh"), complete: vi.fn(complete) };
  }

  it("retries network errors and 5xx, then succeeds", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(ok());
    const r = await transferFile(blob, "https://u", deps(f));
    expect(r).toEqual({ status: "ready", attempts: 3 });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("gets a fresh signed URL after a 403 (expired link)", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 403 })).mockResolvedValueOnce(ok());
    const d = deps(f);
    const r = await transferFile(blob, "https://old", d);
    expect(r.status).toBe("ready");
    expect(d.refreshUrl).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[1][0]).toBe("https://fresh");
  });

  it("gives up after the maximum number of attempts", async () => {
    const f = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    const r = await transferFile(blob, "https://u", deps(f));
    expect(r).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    expect(f).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("does not retry a permanent client error", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 413 }));
    const r = await transferFile(blob, "https://u", deps(f));
    expect(r).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("re-uploads if the server says the file never arrived", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(ok());
    const complete = vi
      .fn<() => Promise<CompleteResult>>()
      .mockResolvedValueOnce({ status: "missing" })
      .mockResolvedValueOnce({ status: "ready" });
    const r = await transferFile(blob, "https://u", { ...deps(f), complete });
    expect(r).toEqual({ status: "ready", attempts: 2 });
  });

  it("reports a server-side rejection without retrying", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(ok());
    const r = await transferFile(blob, "https://u", deps(f, async () => ({ status: "rejected", reason: "too big" })));
    expect(r).toEqual({ status: "rejected", reason: "too big", attempts: 1 });
  });
});
