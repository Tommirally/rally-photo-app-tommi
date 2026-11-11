/**
 * Permission and search tests for the pilot schema, run against real Postgres
 * with Supabase's roles. Start the database with: scripts/local-db.sh start
 *
 * Cast:
 *   A  – Fern Hollow, approved at the public event and the draft event
 *   B  – Gravel Line, approved at the public event and "other-rally"
 *   C  – photographer whose membership is still pending
 *   D  – photographer who gets suspended mid-event
 *   E  – signed-in user with no photographer profile
 *   anon – an anonymous visitor
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UPLOAD_LIMITS } from "@/lib/upload/limits";
import { anon, closeDatabase, owner, resetDatabase, service, sql, type Actor } from "./harness";

const uid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const A: Actor = { role: "authenticated", userId: uid(1) };
const B: Actor = { role: "authenticated", userId: uid(2) };
const C: Actor = { role: "authenticated", userId: uid(3) };
const D: Actor = { role: "authenticated", userId: uid(4) };
const E: Actor = { role: "authenticated", userId: uid(5) };

const ids: Record<string, string> = {};

type BatchResult = { batch_id: string; photos: { id: string; sequence: number; object_key: string; original_filename: string }[] };

const jpg = (name: string, size = 200_000) => ({ name, size, type: "image/jpeg" });

async function upload(actor: Actor, eventId: string, files: object[]): Promise<BatchResult> {
  const [row] = await sql<{ r: BatchResult }>(actor, "select public.create_upload_batch($1, $2::jsonb) as r", [
    eventId,
    JSON.stringify(files),
  ]);
  return row.r;
}

async function finalize(photoId: string, exif: string | null = null, offset: string | null = null, accept = true) {
  const [row] = await sql<{ r: Record<string, unknown> }>(
    service,
    "select public.finalize_photo_upload($1, $2, 200000, 1200, 800, $3, $4, $5) as r",
    [photoId, accept, exif, offset, accept ? null : "Not a JPEG"],
  );
  return row.r;
}

async function rpc<T = Record<string, unknown>>(actor: Actor, fn: string, ...args: unknown[]): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const [row] = await sql<{ r: T }>(actor, `select public.${fn}(${placeholders}) as r`, args);
  return row.r;
}

async function search(actor: Actor, slug: string, number: string | null) {
  return sql<{ photo_id: string; photographer_name: string; numbers: string[] }>(
    actor,
    "select * from public.search_event_photos($1, $2)",
    [slug, number],
  );
}

beforeAll(async () => {
  await resetDatabase();
  // Manual pilot setup, as the project owner would do in the SQL Editor.
  for (let i = 1; i <= 5; i++) await owner("insert into auth.users (id, email) values ($1, $2)", [uid(i), `user${i}@example.test`]);
  const ev = async (slug: string, isPublic: boolean) =>
    (await owner<{ id: string }>(
      "insert into public.events (slug, name, start_date, end_date, is_public) values ($1, $1, '2026-03-14', '2026-03-14', $2) returning id",
      [slug, isPublic],
    ))[0].id;
  ids.pub = await ev("test-rally", true);
  ids.draft = await ev("draft-rally", false);
  ids.other = await ev("other-rally", true);

  for (const n of ["7", "15", "32", "032", "320"]) {
    ids[`e${n}`] = (await owner<{ id: string }>("insert into public.entries (event_id, number) values ($1, $2) returning id", [ids.pub, n]))[0].id;
  }
  ids.other32 = (await owner<{ id: string }>("insert into public.entries (event_id, number) values ($1, '32') returning id", [ids.other]))[0].id;
  await owner("insert into public.entries (event_id, number) values ($1, '32')", [ids.draft]);

  const pg = async (n: number, slug: string, name: string) =>
    (await owner<{ id: string }>(
      "insert into public.photographers (user_id, slug, display_name, credit) values ($1, $2, $3, $4) returning id",
      [uid(n), slug, name, `© ${name}`],
    ))[0].id;
  ids.pA = await pg(1, "fern-hollow", "Fern Hollow");
  ids.pB = await pg(2, "gravel-line", "Gravel Line");
  ids.pC = await pg(3, "pending-pics", "Pending Pics");
  ids.pD = await pg(4, "soon-suspended", "Soon Suspended");

  const member = (e: string, p: string, status: string) =>
    owner("insert into public.event_photographers (event_id, photographer_id, status) values ($1, $2, $3)", [e, p, status]);
  await member(ids.pub, ids.pA, "approved");
  await member(ids.pub, ids.pB, "approved");
  await member(ids.pub, ids.pC, "pending");
  await member(ids.pub, ids.pD, "approved");
  await member(ids.draft, ids.pA, "approved");
  await member(ids.other, ids.pB, "approved");
});

afterAll(closeDatabase);

describe("limits", () => {
  it("database upload limits match the app's limits", async () => {
    const [{ l }] = await owner<{ l: Record<string, unknown> }>("select public.upload_limits() as l");
    expect(l).toEqual({
      max_file_bytes: UPLOAD_LIMITS.maxFileBytes,
      max_files_per_batch: UPLOAD_LIMITS.maxFilesPerBatch,
      max_long_edge_px: UPLOAD_LIMITS.maxLongEdgePx,
      min_long_edge_px: UPLOAD_LIMITS.minLongEdgePx,
      content_type: UPLOAD_LIMITS.contentType,
    });
  });
});

describe("who may upload", () => {
  it("anonymous visitors cannot call the upload function", async () => {
    await expect(upload(anon, ids.pub, [jpg("a.jpg")])).rejects.toThrow(/permission denied/);
  });

  it("a signed-in user without a photographer profile cannot upload", async () => {
    await expect(upload(E, ids.pub, [jpg("a.jpg")])).rejects.toThrow(/Not approved/);
  });

  it("a pending photographer cannot upload", async () => {
    await expect(upload(C, ids.pub, [jpg("a.jpg")])).rejects.toThrow(/Not approved/);
  });

  it("an approved photographer cannot upload to an event they are not approved for", async () => {
    await expect(upload(A, ids.other, [jpg("a.jpg")])).rejects.toThrow(/Not approved/);
  });

  it("nobody can insert batches or photos for someone else directly", async () => {
    await expect(
      sql(B, "insert into public.upload_batches (event_id, photographer_id, file_count) values ($1, $2, 1)", [ids.pub, ids.pA]),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("upload limits in the database", () => {
  it("rejects more than the per-batch file limit", async () => {
    const files = Array.from({ length: UPLOAD_LIMITS.maxFilesPerBatch + 1 }, (_, i) => jpg(`IMG_${i}.jpg`));
    await expect(upload(A, ids.pub, files)).rejects.toThrow(/between 1 and 100/);
  });

  it("rejects an empty batch", async () => {
    await expect(upload(A, ids.pub, [])).rejects.toThrow(/between 1 and 100/);
  });

  it("rejects a file over the size limit", async () => {
    await expect(upload(A, ids.pub, [jpg("big.jpg", UPLOAD_LIMITS.maxFileBytes + 1)])).rejects.toThrow(/larger than the upload limit/);
  });

  it("rejects non-JPEG names and types", async () => {
    await expect(upload(A, ids.pub, [{ name: "x.png", size: 10, type: "image/png" }])).rejects.toThrow(/Only .jpg/);
    await expect(upload(A, ids.pub, [{ name: "x.jpg", size: 10, type: "image/png" }])).rejects.toThrow(/Only JPEG/);
  });

  it("writes nothing when one file in the batch is invalid", async () => {
    await expect(upload(A, ids.pub, [jpg("ok.jpg"), jpg("bad.jpg", 0)])).rejects.toThrow();
    const rows = await owner("select 1 from public.photos where original_filename = 'ok.jpg'");
    expect(rows).toHaveLength(0);
  });
});

describe("photographer A's workflow", () => {
  let batch: BatchResult;

  it("creates a batch with stable object keys and sequence numbers", async () => {
    batch = await upload(A, ids.pub, [
      jpg("IMG_0001.jpg"),
      jpg("IMG_0002.jpg"),
      jpg("IMG_0003.jpg"),
      jpg("IMG_0004.jpg"),
      jpg("IMG_0005.jpg"),
      jpg("IMG_0006.jpg"),
    ]);
    expect(batch.photos.map((p) => p.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const p of batch.photos) {
      expect(p.object_key).toBe(`events/${ids.pub}/photographers/${ids.pA}/photos/${p.id}.jpg`);
    }
    batch.photos.forEach((p, i) => (ids[`a${i + 1}`] = p.id));
  });

  it("cannot choose or change its own object key, status or identity", async () => {
    await expect(sql(A, "update public.photos set object_key = 'x.jpg' where id = $1", [ids.a1])).rejects.toThrow(/permission denied/);
    await expect(sql(A, "update public.photos set upload_status = 'ready' where id = $1", [ids.a1])).rejects.toThrow(/permission denied/);
    await expect(
      sql(A, "insert into public.photos (event_id, photographer_id, batch_id, sequence, original_filename, declared_bytes, upload_status) values ($1,$2,$3,99,'x.jpg',10,'ready')", [
        ids.pub,
        ids.pA,
        batch.batch_id,
      ]),
    ).rejects.toThrow(/permission denied/);
    // Even the service role cannot change a key once it is set.
    await expect(sql(service, "update public.photos set object_key = 'moved.jpg' where id = $1", [ids.a1])).rejects.toThrow(/cannot be changed/);
  });

  it("cannot mark its own upload as verified", async () => {
    await expect(finalizeAs(A, ids.a1)).rejects.toThrow(/permission denied/);
  });

  it("cannot publish a photo before the server has verified it", async () => {
    const r = await rpc<{ updated: number; skipped_not_ready: number }>(A, "set_photos_published", [ids.a1], true);
    expect(r).toEqual({ updated: 0, skipped_not_ready: 1 });
    await expect(sql(A, "update public.photos set published_at = now() where id = $1", [ids.a1])).rejects.toThrow(/check constraint/);
  });

  it("stores capture time from EXIF, using the event time zone when there is no offset", async () => {
    expect(await finalize(ids.a1, "2026:03:14 09:12:05")).toMatchObject({ upload_status: "ready", capture_time_source: "exif_event_timezone" });
    expect(await finalize(ids.a2, "2026:03:14 09:12:06", "+02:00")).toMatchObject({ capture_time_source: "exif_offset" });
    expect(await finalize(ids.a3, "2026:07:01 10:00:00")).toMatchObject({ capture_time_source: "exif_event_timezone" });
    expect(await finalize(ids.a4, "0000:00:00 00:00:00")).toMatchObject({ capture_time_source: "none" });
    expect(await finalize(ids.a5, null)).toMatchObject({ capture_time_source: "none" });
    expect(await finalize(ids.a6, null, null, false)).toMatchObject({ upload_status: "rejected" });

    const rows = await owner<{ id: string; t: string | null }>(
      "select id, to_char(captured_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as t from public.photos where id = any($1)",
      [[ids.a1, ids.a2, ids.a3, ids.a4]],
    );
    const t = Object.fromEntries(rows.map((r) => [r.id, r.t]));
    expect(t[ids.a1]).toBe("2026-03-14 09:12:05"); // GMT in March
    expect(t[ids.a2]).toBe("2026-03-14 07:12:06"); // camera said +02:00
    expect(t[ids.a3]).toBe("2026-07-01 09:00:00"); // BST in July
    expect(t[ids.a4]).toBeNull();
  });

  it("finalizing again does not change a verified photo", async () => {
    expect(await finalize(ids.a1, "2030:01:01 00:00:00")).toEqual({ upload_status: "ready", rejection_reason: null });
  });

  it("bulk-tags with car numbers; 32, 032 and 320 are different entries", async () => {
    expect(await rpc(A, "add_photo_tags", [ids.a1, ids.a2], ["32"])).toEqual({ added: 2, missing: [] });
    expect(await rpc(A, "add_photo_tags", [ids.a3], [" 032 "])).toEqual({ added: 1, missing: [] });
    expect(await rpc(A, "add_photo_tags", [ids.a4], ["320"])).toEqual({ added: 1, missing: [] });
    // a5: tagged 32 but left unpublished
    expect(await rpc(A, "add_photo_tags", [ids.a5], ["32"])).toEqual({ added: 1, missing: [] });
    // tagging twice is harmless
    expect(await rpc(A, "add_photo_tags", [ids.a1], ["32"])).toEqual({ added: 0, missing: [] });
  });

  it("refuses unknown car numbers and writes nothing", async () => {
    expect(await rpc(A, "add_photo_tags", [ids.a1], ["15", "999"])).toEqual({ added: 0, missing: ["999"] });
    const tags = await sql<{ number: string }>(A, "select e.number from public.photo_tags t join public.entries e on e.id = t.entry_id where t.photo_id = $1", [ids.a1]);
    expect(tags.map((t) => t.number)).toEqual(["32"]);
  });

  it("cannot tag a photo with an entry from another event", async () => {
    await expect(
      sql(A, "insert into public.photo_tags (photo_id, entry_id, event_id) values ($1, $2, $3)", [ids.a1, ids.other32, ids.pub]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(A, "insert into public.photo_tags (photo_id, entry_id, event_id) values ($1, $2, $3)", [ids.a1, ids.other32, ids.other]),
    ).rejects.toThrow(/row-level security|foreign key/);
  });

  it("publishes verified photos and skips rejected ones", async () => {
    const r = await rpc(A, "set_photos_published", [ids.a1, ids.a2, ids.a3, ids.a4, ids.a6], true);
    expect(r).toEqual({ updated: 4, skipped_not_ready: 1 });
  });

  it("can remove a tag it added", async () => {
    await rpc(A, "add_photo_tags", [ids.a2], ["15"]);
    expect(await rpc(A, "remove_photo_tags", [ids.a2], ["15"])).toEqual({ removed: 1 });
  });
});

describe("photographer B is kept out of A's work", () => {
  it("B uploads, tags 32 and publishes in the same event", async () => {
    const batch = await upload(B, ids.pub, [jpg("DSC_100.jpg"), jpg("DSC_101.jpg"), jpg("DSC_102.jpg")]);
    batch.photos.forEach((p, i) => (ids[`b${i + 1}`] = p.id));
    for (const p of batch.photos) await finalize(p.id, "2026:03:14 10:05:00");
    expect(await rpc(B, "add_photo_tags", [ids.b1, ids.b2], ["32"])).toEqual({ added: 2, missing: [] });
    expect(await rpc(B, "set_photos_published", [ids.b1, ids.b2, ids.b3], true)).toMatchObject({ updated: 3 });
  });

  it("B cannot see A's unpublished photo, but can see A's published ones", async () => {
    const seen = await sql<{ id: string }>(B, "select id from public.photos where photographer_id = $1", [ids.pA]);
    const s = new Set(seen.map((r) => r.id));
    expect(s.has(ids.a1)).toBe(true);
    expect(s.has(ids.a5)).toBe(false);
    expect(s.has(ids.a6)).toBe(false);
  });

  it("B cannot publish, unpublish, re-price or edit A's photos", async () => {
    expect(await rpc(B, "set_photos_published", [ids.a5], true)).toEqual({ updated: 0, skipped_not_ready: 0 });
    expect(await rpc(B, "set_photos_published", [ids.a1], false)).toEqual({ updated: 0, skipped_not_ready: 0 });
    expect(await rpc(B, "set_photos_price", [ids.a1], 1)).toEqual({ updated: 0 });
    const rows = await sql(B, "update public.photos set location = 'hacked' where id = $1 returning id", [ids.a1]);
    expect(rows).toHaveLength(0);
  });

  it("B cannot add or remove tags on A's photos", async () => {
    expect(await rpc(B, "add_photo_tags", [ids.a1], ["7"])).toMatchObject({ added: 0, error: "No photos of yours were selected" });
    await expect(
      sql(B, "insert into public.photo_tags (photo_id, entry_id, event_id) values ($1, $2, $3)", [ids.a1, ids.e7, ids.pub]),
    ).rejects.toThrow(/row-level security/);
    expect(await rpc(B, "remove_photo_tags", [ids.a1], ["32"])).toEqual({ removed: 0 });
    expect(await sql(B, "delete from public.photo_tags where photo_id = $1 returning photo_id", [ids.a1])).toHaveLength(0);
  });

  it("B cannot see A's upload batches", async () => {
    expect(await sql(B, "select * from public.upload_batches where photographer_id = $1", [ids.pA])).toHaveLength(0);
  });
});

describe("suggested tags stay separate from confirmed tags", () => {
  it("only the service role can create suggestions", async () => {
    await expect(
      sql(A, "insert into public.tag_suggestions (photo_id, event_id, suggested_number, source) values ($1, $2, '7', 'number_recognition')", [ids.a4, ids.pub]),
    ).rejects.toThrow(/permission denied/);
    const rows = await sql<{ id: string }>(
      service,
      `insert into public.tag_suggestions (photo_id, event_id, suggested_number, entry_id, source, confidence)
       values ($1, $2, '7', $3, 'number_recognition', 0.91),
              ($1, $2, '15', $4, 'burst', null)
       returning id`,
      [ids.a4, ids.pub, ids.e7, ids.e15],
    );
    ids.s7 = rows[0].id;
    ids.s15 = rows[1].id;
  });

  it("a pending suggestion does not appear in public search", async () => {
    expect(await search(anon, "test-rally", "7")).toHaveLength(0);
  });

  it("only the owning photographer can read or review suggestions", async () => {
    await expect(sql(anon, "select * from public.tag_suggestions")).rejects.toThrow(/permission denied/);
    expect(await sql(B, "select * from public.tag_suggestions")).toHaveLength(0);
    expect(await sql(A, "select * from public.tag_suggestions")).toHaveLength(2);
    await expect(rpc(B, "review_tag_suggestion", ids.s7, true)).rejects.toThrow(/not found/);
    await expect(sql(A, "update public.tag_suggestions set status = 'accepted' where id = $1", [ids.s7])).rejects.toThrow(/permission denied/);
  });

  it("accepting turns it into a confirmed tag; rejecting does not", async () => {
    expect(await rpc(A, "review_tag_suggestion", ids.s7, true)).toEqual({ status: "accepted" });
    expect(await rpc(A, "review_tag_suggestion", ids.s15, false)).toEqual({ status: "rejected" });
    expect((await search(anon, "test-rally", "7")).map((p) => p.photo_id)).toEqual([ids.a4]);
    expect(await search(anon, "test-rally", "15")).toHaveLength(0);
    const [tag] = await owner<{ source: string }>("select source from public.photo_tags where photo_id = $1 and entry_id = $2", [ids.a4, ids.e7]);
    expect(tag.source).toBe("suggestion");
  });
});

describe("public search (anonymous visitor)", () => {
  it("searching 32 returns only car 32, from both photographers, published photos only", async () => {
    const r = await search(anon, "test-rally", "32");
    expect(new Set(r.map((p) => p.photo_id))).toEqual(new Set([ids.a1, ids.a2, ids.b1, ids.b2]));
    expect(new Set(r.map((p) => p.photographer_name))).toEqual(new Set(["Fern Hollow", "Gravel Line"]));
    expect(r.every((p) => p.numbers.includes("32"))).toBe(true);
    expect(r.map((p) => p.photo_id)).not.toContain(ids.a5); // tagged 32 but unpublished
  });

  it("032 and 320 return only their own car", async () => {
    expect((await search(anon, "test-rally", "032")).map((p) => p.photo_id)).toEqual([ids.a3]);
    expect((await search(anon, "test-rally", "320")).map((p) => p.photo_id)).toEqual([ids.a4]);
  });

  it("does not match partially", async () => {
    for (const q of ["3", "03", "20", "0032", "3200", "x32"]) {
      expect(await search(anon, "test-rally", q)).toHaveLength(0);
    }
  });

  it("ignores spaces (a stray space typed on a phone still works)", async () => {
    expect(await search(anon, "test-rally", "  32 ")).toHaveLength(4);
    expect((await search(anon, "test-rally", "32 0")).map((p) => p.photo_id)).toEqual([ids.a4]); // = 320
  });

  it("car numbers are scoped to their event", async () => {
    expect(await search(anon, "other-rally", "32")).toHaveLength(0);
  });

  it("a logged-in photographer searching publicly still sees only published photos", async () => {
    const r = await search(A, "test-rally", "32");
    expect(r.map((p) => p.photo_id)).not.toContain(ids.a5);
  });

  it("shows untagged published photos in the full gallery but never unpublished ones", async () => {
    const all = (await search(anon, "test-rally", null)).map((p) => p.photo_id);
    expect(all).toContain(ids.b3);
    expect(all).not.toContain(ids.a5);
    expect(all).not.toContain(ids.a6);
  });

  it("lists quick-pick numbers that have public photos", async () => {
    const r = await sql<{ number: string; photo_count: string }>(anon, "select * from public.public_event_numbers('test-rally')");
    expect(r.map((x) => [x.number, Number(x.photo_count)])).toEqual([
      ["032", 1],
      ["32", 4],
      ["320", 1],
      ["7", 1],
    ]);
  });

  it("cannot see draft events or anything in them", async () => {
    expect(await sql(anon, "select * from public.events where slug = 'draft-rally'")).toHaveLength(0);
    expect(await sql(anon, "select * from public.entries where event_id = $1", [ids.draft])).toHaveLength(0);
    expect(await search(anon, "draft-rally", "32")).toHaveLength(0);
    // ...but the approved photographer can, to prepare before launch
    expect(await sql(A, "select * from public.events where slug = 'draft-rally'")).toHaveLength(1);
    expect(await sql(B, "select * from public.events where slug = 'draft-rally'")).toHaveLength(0);
  });

  it("cannot read private columns or tables", async () => {
    await expect(sql(anon, "select user_id from public.photographers")).rejects.toThrow(/permission denied/);
    await expect(sql(B, "select user_id from public.photographers")).rejects.toThrow(/permission denied/);
    expect(await sql(anon, "select display_name from public.photographers order by 1")).toEqual([
      { display_name: "Fern Hollow" },
      { display_name: "Gravel Line" },
      { display_name: "Soon Suspended" },
    ]);
    await expect(sql(anon, "select * from public.upload_batches")).rejects.toThrow(/permission denied/);
    const visible = await sql<{ id: string }>(anon, "select id from public.photos");
    expect(visible.map((r) => r.id)).not.toContain(ids.a5);
    expect(visible.map((r) => r.id)).not.toContain(ids.a6);
  });

  it("cannot write anything", async () => {
    await expect(sql(anon, "insert into public.events (slug, name, start_date, end_date) values ('x','x','2026-01-01','2026-01-01')")).rejects.toThrow(/permission denied/);
    await expect(sql(anon, "update public.photos set price_pence = 1")).rejects.toThrow(/permission denied/);
    await expect(sql(anon, "delete from public.photo_tags")).rejects.toThrow(/permission denied/);
    await expect(rpc(anon, "add_photo_tags", [ids.a1], ["7"])).rejects.toThrow(/permission denied/);
    await expect(rpc(anon, "set_photos_published", [ids.a1], false)).rejects.toThrow(/permission denied/);
  });

  it("photographers cannot set up events or approve themselves", async () => {
    await expect(sql(C, "update public.event_photographers set status = 'approved' where photographer_id = $1", [ids.pC])).rejects.toThrow(/permission denied/);
    await expect(sql(A, "insert into public.entries (event_id, number) values ($1, '99')", [ids.pub])).rejects.toThrow(/permission denied/);
    await expect(sql(A, "update public.events set is_public = true where id = $1", [ids.draft])).rejects.toThrow(/permission denied/);
  });
});

describe("suspension", () => {
  it("a suspended photographer can no longer upload, tag or publish", async () => {
    const batch = await upload(D, ids.pub, [jpg("D1.jpg")]);
    const id = batch.photos[0].id;
    await finalize(id, null);
    await owner("update public.event_photographers set status = 'suspended' where photographer_id = $1", [ids.pD]);
    await expect(upload(D, ids.pub, [jpg("D2.jpg")])).rejects.toThrow(/Not approved/);
    await expect(rpc(D, "add_photo_tags", [id], ["32"])).rejects.toThrow(/row-level security/);
    await expect(rpc(D, "set_photos_published", [id], true)).rejects.toThrow(/row-level security/);
  });
});

async function finalizeAs(actor: Actor, photoId: string) {
  return sql(actor, "select public.finalize_photo_upload($1, true, 1, 1200, 800, null, null, null)", [photoId]);
}
