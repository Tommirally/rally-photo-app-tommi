"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicEnv } from "./env";

export function createSupabaseBrowserClient() {
  const env = supabasePublicEnv();
  if (!env) throw new Error("Supabase is not configured. See README → Set up Supabase.");
  return createBrowserClient(env.url, env.key);
}
