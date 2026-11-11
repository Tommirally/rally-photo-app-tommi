import { NextResponse } from "next/server";
import { jsonError, loadOwnPhoto, requirePhotographer } from "@/lib/server/api";
import { presignUpload } from "@/lib/storage/s3";

/** A fresh signed upload URL, used when a retry finds the old one expired. */
export async function POST(_request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const ctx = await requirePhotographer();
  if (ctx instanceof NextResponse) return ctx;
  const { photoId } = await params;
  const photo = await loadOwnPhoto(ctx, photoId);
  if (!photo) return jsonError(404, "Photo not found.");
  if (photo.upload_status !== "pending") return jsonError(409, "This photo has already been processed.");
  const uploadUrl = await presignUpload(ctx.storage, photo.object_key, photo.declared_bytes);
  return NextResponse.json({ uploadUrl }, { headers: { "Cache-Control": "no-store" } });
}
