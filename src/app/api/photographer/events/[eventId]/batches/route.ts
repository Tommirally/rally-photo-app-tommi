import { NextResponse } from "next/server";
import { jsonError, requirePhotographer } from "@/lib/server/api";
import { presignUpload } from "@/lib/storage/s3";
import { UPLOAD_LIMITS } from "@/lib/upload/limits";

type Body = { files?: { name?: unknown; size?: unknown; type?: unknown }[] };
type BatchPhoto = { id: string; sequence: number; object_key: string; original_filename: string; declared_bytes: number };

/** Create an upload batch: one pending photo per file, each with a signed R2 upload URL. */
export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const ctx = await requirePhotographer();
  if (ctx instanceof NextResponse) return ctx;
  const { eventId } = await params;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid request.");
  }
  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length < 1 || files.length > UPLOAD_LIMITS.maxFilesPerBatch) {
    return jsonError(400, `Choose between 1 and ${UPLOAD_LIMITS.maxFilesPerBatch} photos.`);
  }
  const clean = files.map((f) => ({ name: String(f.name ?? ""), size: Number(f.size), type: String(f.type ?? "") }));

  // The database re-validates names, types, sizes and the photographer's approval.
  const { data, error } = await ctx.supabase.rpc("create_upload_batch", { p_event_id: eventId, p_files: clean });
  if (error) {
    const status = error.code === "42501" ? 403 : 400;
    return jsonError(status, error.message);
  }
  const batch = data as { batch_id: string; photos: BatchPhoto[] };
  const photos = await Promise.all(
    batch.photos.map(async (p) => ({
      id: p.id,
      sequence: p.sequence,
      name: p.original_filename,
      uploadUrl: await presignUpload(ctx.storage, p.object_key, p.declared_bytes),
    })),
  );
  return NextResponse.json({ batchId: batch.batch_id, photos }, { headers: { "Cache-Control": "no-store" } });
}
