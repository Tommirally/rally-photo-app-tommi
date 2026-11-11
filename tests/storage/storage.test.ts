/**
 * Upload pipeline against a local S3-compatible emulator (moto) standing in
 * for Cloudflare R2. Start it with: scripts/local-r2.sh start
 */
import { CreateBucketCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createStorage, presignUpload, presignView, verifyUpload } from "@/lib/storage/s3";
import { UPLOAD_LIMITS } from "@/lib/upload/limits";
import { transferFile } from "@/lib/upload/transfer";

const storage = createStorage({
  endpoint: process.env.R2_TEST_ENDPOINT ?? "http://127.0.0.1:54340",
  bucket: `test-${Date.now()}`,
  accessKeyId: "test",
  secretAccessKey: "test",
});

const photo = (name: string) => readFileSync(path.join(__dirname, "../fixtures/photos", name));
let n = 0;
const key = () => `events/e/photographers/p/photos/test-${++n}.jpg`;

async function put(k: string, body: Uint8Array, declared = body.length) {
  const url = await presignUpload(storage, k, declared);
  const res = await fetch(url, { method: "PUT", body: Buffer.from(body), headers: { "Content-Type": "image/jpeg" } });
  expect(res.status).toBe(200);
}

async function exists(k: string) {
  try {
    await storage.client.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: k }));
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  await storage.client.send(new CreateBucketCommand({ Bucket: storage.bucket }));
});

describe("signed upload URLs", () => {
  it("sign the exact size and the JPEG content type", async () => {
    const url = new URL(await presignUpload(storage, "a/b.jpg", 1234));
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
  });

  it("view URLs are stable within the hour so browsers can cache them", async () => {
    const a = await presignView(storage, "a/b.jpg", new Date("2026-03-14T09:05:00Z"));
    const b = await presignView(storage, "a/b.jpg", new Date("2026-03-14T09:55:00Z"));
    const c = await presignView(storage, "a/b.jpg", new Date("2026-03-14T10:01:00Z"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("verifyUpload", () => {
  it("accepts a web-sized JPEG and reads its size and capture time", async () => {
    const k = key();
    const body = photo("car32-a.jpg");
    await put(k, body);
    expect(await verifyUpload(storage, k, body.length)).toEqual({
      status: "ok",
      byteSize: body.length,
      width: 1200,
      height: 800,
      exifDateTimeOriginal: "2026:03:14 09:12:05",
      exifOffsetTimeOriginal: null,
    });
    // and it can be viewed through a signed URL
    const view = await fetch(await presignView(storage, k));
    expect(Buffer.from(await view.arrayBuffer()).equals(body)).toBe(true);
  });

  it("reports a missing object so the browser uploads again", async () => {
    expect(await verifyUpload(storage, key(), 100)).toEqual({ status: "missing" });
  });

  it("rejects and deletes a file over the size limit", async () => {
    const k = key();
    const big = new Uint8Array(UPLOAD_LIMITS.maxFileBytes + 1);
    big.set(photo("car32-a.jpg"));
    await put(k, big);
    const r = await verifyUpload(storage, k, big.length);
    expect(r).toMatchObject({ status: "rejected", reason: expect.stringContaining("larger than the upload limit") });
    expect(await exists(k)).toBe(false);
  });

  it("rejects a file whose size differs from what was declared", async () => {
    const k = key();
    const body = photo("car32-a.jpg");
    await put(k, body);
    const r = await verifyUpload(storage, k, body.length - 1);
    expect(r).toMatchObject({ status: "rejected", reason: expect.stringContaining("does not match") });
    expect(await exists(k)).toBe(false);
  });

  it("rejects a PNG renamed to .jpg", async () => {
    const k = key();
    const body = photo("really-a-png.jpg");
    await put(k, body);
    expect(await verifyUpload(storage, k, body.length)).toMatchObject({ status: "rejected", reason: expect.stringContaining("not a valid JPEG") });
  });

  it("rejects images wider than the web-size limit", async () => {
    const k = key();
    const body = photo("too-wide.jpg");
    await put(k, body);
    expect(await verifyUpload(storage, k, body.length)).toMatchObject({ status: "rejected", reason: expect.stringContaining("3200×2000") });
  });

  it("rejects images that are too small", async () => {
    const k = key();
    const body = photo("too-small.jpg");
    await put(k, body);
    expect(await verifyUpload(storage, k, body.length)).toMatchObject({ status: "rejected", reason: expect.stringContaining("500×340") });
  });

  it("reads past large metadata blocks to find the image size", async () => {
    const src = photo("car32-a.jpg");
    const pad: number[] = [];
    for (let i = 0; i < 5; i++) {
      const len = 65000;
      pad.push(0xff, 0xef, len >> 8, len & 0xff, ...new Array(len - 2).fill(0));
    }
    const body = new Uint8Array([...src.subarray(0, 2), ...pad, ...src.subarray(2)]);
    expect(body.length).toBeGreaterThan(262144);
    const k = key();
    await put(k, body);
    expect(await verifyUpload(storage, k, body.length)).toMatchObject({ status: "ok", width: 1200, height: 800 });
  });
});

describe("browser transfer with retries (real HTTP to the emulator)", () => {
  it("survives two dropped connections and ends up verified", async () => {
    const k = key();
    const body = photo("car032.jpg");
    let calls = 0;
    const flaky: typeof fetch = async (input, init) => {
      calls++;
      if (calls <= 2) throw new TypeError("Failed to fetch");
      return fetch(input, init);
    };
    const r = await transferFile(new Blob([body], { type: "image/jpeg" }), await presignUpload(storage, k, body.length), {
      fetch: flaky,
      sleep: async () => {},
      refreshUrl: () => presignUpload(storage, k, body.length),
      complete: async () => {
        const v = await verifyUpload(storage, k, body.length);
        return v.status === "ok" ? { status: "ready" } : v;
      },
    });
    expect(r).toEqual({ status: "ready", attempts: 3 });
    expect(await exists(k)).toBe(true);
  });

  it("recovers when storage returns 500 and then a refused (403) link", async () => {
    const k = key();
    const body = photo("car320.jpg");
    const answers = [500, 403];
    let refreshed = 0;
    const r = await transferFile(new Blob([body]), await presignUpload(storage, k, body.length), {
      fetch: async (input, init) => {
        const s = answers.shift();
        return s ? new Response(null, { status: s }) : fetch(input, init);
      },
      sleep: async () => {},
      refreshUrl: async () => {
        refreshed++;
        return presignUpload(storage, k, body.length);
      },
      complete: async () => {
        const v = await verifyUpload(storage, k, body.length);
        return v.status === "ok" ? { status: "ready" } : v;
      },
    });
    expect(r).toEqual({ status: "ready", attempts: 3 });
    expect(refreshed).toBe(1);
  });
});
