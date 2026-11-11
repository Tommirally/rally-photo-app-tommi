import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublicEnv } from "@/lib/supabase/env";

/** Client acting as the signed-in user (from cookies). RLS applies. */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const env = supabasePublicEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** Anonymous client for public pages: never carries a session, so a logged-in
 *  photographer browsing the gallery sees exactly what the public sees. */
export function createSupabasePublicClient(): SupabaseClient | null {
  const env = supabasePublicEnv();
  if (!env) return null;
  return createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Service-role client. SERVER ONLY: bypasses RLS. Used only to record the
 *  result of verifying an upload. */
export function createSupabaseAdminClient(): SupabaseClient {
  const env = supabasePublicEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!env || !secret) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(env.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface PhotographerSession {
  supabase: SupabaseClient;
  userId: string;
  email: string | null;
  photographer: { id: string; display_name: string; credit: string } | null;
}

/** The signed-in user and their photographer profile, or null if not signed in. */
export async function getPhotographerSession(): Promise<PhotographerSession | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: myId } = await supabase.rpc("current_photographer_id");
  let photographer: PhotographerSession["photographer"] = null;
  if (myId) {
    const { data } = await supabase.from("photographers").select("id, display_name, credit").eq("id", myId).maybeSingle();
    photographer = data;
  }
  return { supabase, userId: auth.user.id, email: auth.user.email ?? null, photographer };
}
