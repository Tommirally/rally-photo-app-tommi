import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Storage } from "@/lib/storage/s3";
import { getStorage } from "./r2";
import { createSupabaseServerClient } from "./supabase";

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export type PhotographerContext = { supabase: SupabaseClient; photographerId: string; storage: Storage };

/** Signed-in photographer + storage, or an error response. */
export async function requirePhotographer(): Promise<PhotographerContext | NextResponse> {
  const storage = getStorage();
  const supabase = await createSupabaseServerClient();
  if (!supabase || !storage) return jsonError(503, "Uploads are not configured on this server.");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return jsonError(401, "Please sign in again.");
  const { data: photographerId } = await supabase.rpc("current_photographer_id");
  if (!photographerId) return jsonError(403, "This account has no photographer profile yet.");
  return { supabase, photographerId: photographerId as string, storage };
}

export interface OwnPendingPhoto {
  id: string;
  object_key: string;
  declared_bytes: number;
  upload_status: "pending" | "ready" | "rejected";
  rejection_reason: string | null;
}

/** Loads one of the caller's own photos (never someone else's, even if public). */
export async function loadOwnPhoto(ctx: PhotographerContext, photoId: string): Promise<OwnPendingPhoto | null> {
  if (!/^[0-9a-f-]{36}$/i.test(photoId)) return null;
  const { data } = await ctx.supabase
    .from("photos")
    .select("id, object_key, declared_bytes, upload_status, rejection_reason")
    .eq("id", photoId)
    .eq("photographer_id", ctx.photographerId)
    .maybeSingle();
  return (data as OwnPendingPhoto | null) ?? null;
}
