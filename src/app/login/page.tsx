import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getPhotographerSession } from "@/lib/server/supabase";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Photographer sign-in" };
export const dynamic = "force-dynamic";

/** Only allow returning to our own pages. */
function safeNext(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/photographer";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  if (isSupabaseConfigured() && (await getPhotographerSession())) redirect(next);
  return (
    <main className="page narrow">
      <Link href="/" className="back-link">← Events</Link>
      <h1>Photographer sign-in</h1>
      {isSupabaseConfigured() ? (
        <>
          <p className="muted">For photographers invited to the pilot. Your account is set up by the organiser.</p>
          <LoginForm next={next} />
        </>
      ) : (
        <p className="notice">Sign-in is not configured on this server yet (Supabase settings are missing).</p>
      )}
    </main>
  );
}
