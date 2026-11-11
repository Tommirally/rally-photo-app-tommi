/**
 * Public Supabase settings. These two values are safe in the browser: the
 * publishable (anon) key only grants what row level security allows.
 * NEXT_PUBLIC_* must be read with literal names so Next.js can inline them.
 */
export function supabasePublicEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  return supabasePublicEnv() !== null;
}
