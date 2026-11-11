import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { checkAdmin } from "./admin";

/** Use at the top of every /admin page. Never trust the layout alone. */
export async function adminPageGuard(path: string): Promise<SupabaseClient> {
  const check = await checkAdmin();
  if (check.status === "signed-out") redirect(`/login?next=${encodeURIComponent(path)}`);
  if (check.status !== "ok") redirect("/admin/not-allowed");
  return check.admin;
}
