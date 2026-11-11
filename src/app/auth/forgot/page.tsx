import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ForgotForm } from "./ForgotForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <main className="page narrow">
      <Link href="/login" className="back-link">← Sign in</Link>
      <h1>Forgot password</h1>
      {isSupabaseConfigured() ? <ForgotForm /> : <p className="notice">Sign-in is not configured on this server yet.</p>}
    </main>
  );
}
