import { isSupabaseConfigured } from "@/lib/supabase/env";
import { WelcomeForm } from "./WelcomeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set your password" };

export default function WelcomePage() {
  return (
    <main className="page narrow">
      <h1>Set your password</h1>
      {isSupabaseConfigured() ? <WelcomeForm /> : <p className="notice">Sign-in is not configured on this server yet.</p>}
    </main>
  );
}
