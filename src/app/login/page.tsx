import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getPhotographerSession } from "@/lib/server/supabase";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Photographer sign-in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (isSupabaseConfigured() && (await getPhotographerSession())) redirect("/photographer");
  return (
    <main className="page narrow">
      <Link href="/" className="back-link">← Events</Link>
      <h1>Photographer sign-in</h1>
      {isSupabaseConfigured() ? (
        <>
          <p className="muted">For photographers invited to the pilot. Your account is set up by the organiser.</p>
          <LoginForm />
        </>
      ) : (
        <p className="notice">Sign-in is not configured on this server yet (Supabase settings are missing).</p>
      )}
    </main>
  );
}
