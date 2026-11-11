import Link from "next/link";
import { checkAdmin } from "@/lib/server/admin";
import { SignOutButton } from "../../photographer/SignOutButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function NotAllowed() {
  const check = await checkAdmin();
  return (
    <main className="page narrow">
      <h1>Admin</h1>
      {check.status === "not-configured" && <p>The admin area isn’t configured on this server (Supabase settings are missing).</p>}
      {check.status === "not-admin" && (
        <>
          <p>
            You’re signed in as <strong>{check.email}</strong>, which isn’t an admin account.
          </p>
          <p className="muted small">
            To allow it, add this email to the <code>ADMIN_EMAILS</code> setting in Vercel and redeploy.
          </p>
          <SignOutButton />
        </>
      )}
      {(check.status === "ok" || check.status === "signed-out") && <Link href="/admin">Go to admin</Link>}
    </main>
  );
}
