import { NextResponse } from "next/server";
import { jsonError, loadOwnPhoto, requirePhotographer } from "@/lib/server/api";
import { createSupabaseAdminClient } from "@/lib/server/supabase";
import { verifyUpload } from "@/lib/storage/s3";

/**
 * The browser says "my file is in R2". We check the object ourselves (size,
 * real JPEG, pixel dimensions, EXIF capture time) and only then mark the
 * photo ready. Only this server-side step can do that (service role).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const ctx = await requirePhotographer();
  if (ctx instanceof NextResponse) return ctx;
  const { photoId } = await params;
  const photo = await loadOwnPhoto(ctx, photoId);
  if (!photo) return jsonError(404, "Photo not found.");

  const noStore = { headers: { "Cache-Control": "no-store" } };
  if (photo.upload_status === "ready") return NextResponse.json({ status: "ready" }, noStore);
  if (photo.upload_status === "rejected") {
    return NextResponse.json({ status: "rejected", reason: photo.rejection_reason ?? "Rejected" }, noStore);
  }

  const result = await verifyUpload(ctx.storage, photo.object_key, photo.declared_bytes);
  if (result.status === "missing") return NextResponse.json({ status: "missing" }, noStore);

  const admin = createSupabaseAdminClient();
  const accept = result.status === "ok";
  const { error } = await admin.rpc("finalize_photo_upload", {
    p_photo_id: photo.id,
    p_accept: accept,
    p_byte_size: accept ? result.byteSize : null,
    p_width: accept ? result.width : null,
    p_height: accept ? result.height : null,
    p_exif_datetime: accept ? result.exifDateTimeOriginal : null,
    p_exif_offset: accept ? result.exifOffsetTimeOriginal : null,
    p_rejection_reason: accept ? null : result.reason,
  });
  if (error) return jsonError(500, "Could not record the upload. Please retry.");

  // Photos go live as soon as they pass the checks, tagged or not
  // (PRODUCT_BRIEF 1b). Photographers can still unpublish.
  if (accept) {
    const { error: publishError } = await admin
      .from("photos")
      .update({ published_at: new Date().toISOString() })
      .eq("id", photo.id)
      .eq("upload_status", "ready")
      .is("published_at", null);
    if (publishError) console.error("Auto-publish failed", photo.id, publishError.message);
  }

  return NextResponse.json(accept ? { status: "ready" } : { status: "rejected", reason: result.reason }, noStore);
}
