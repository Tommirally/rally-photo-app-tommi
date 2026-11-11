import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient, createSupabaseServerClient } from "./supabase";

/** Emails allowed into /admin, from the ADMIN_EMAILS setting (comma-separated). */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export type AdminCheck =
  | { status: "ok"; admin: SupabaseClient; email: string }
  | { status: "signed-out" }
  | { status: "not-admin"; email: string | null }
  | { status: "not-configured" };

/**
 * Who is asking? The admin client (service role) is only handed out after the
 * signed-in user's email is confirmed to be on the ADMIN_EMAILS list.
 */
export async function checkAdmin(): Promise<AdminCheck> {
  const supabase = await createSupabaseServerClient();
  if (!supabase || !process.env.SUPABASE_SECRET_KEY) return { status: "not-configured" };
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { status: "signed-out" };
  const email = data.user.email?.toLowerCase() ?? null;
  if (!email || !adminEmails().includes(email)) return { status: "not-admin", email };
  return { status: "ok", admin: createSupabaseAdminClient(), email };
}

/** For server actions: throws unless the caller is an admin. */
export async function requireAdmin(): Promise<SupabaseClient> {
  const check = await checkAdmin();
  if (check.status !== "ok") throw new Error("Not allowed");
  return check.admin;
}
