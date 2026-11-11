"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Landing page for invite and password-reset emails. Supabase can send the
 * person here in three ways depending on settings: tokens in the #hash,
 * ?code= (PKCE) or ?token_hash=&type=. We accept all three, then ask for a
 * new password.
 */
export function WelcomeForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "ready" | "invalid">("checking");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.slice(1));
      try {
        if (hash.get("access_token") && hash.get("refresh_token")) {
          const { error: e } = await supabase.auth.setSession({
            access_token: hash.get("access_token")!,
            refresh_token: hash.get("refresh_token")!,
          });
          if (e) throw e;
        } else if (url.searchParams.get("code")) {
          const { error: e } = await supabase.auth.exchangeCodeForSession(url.searchParams.get("code")!);
          if (e) throw e;
        } else if (url.searchParams.get("token_hash")) {
          const type = (url.searchParams.get("type") ?? "invite") as "invite" | "recovery" | "email";
          const { error: e } = await supabase.auth.verifyOtp({ token_hash: url.searchParams.get("token_hash")!, type });
          if (e) throw e;
        }
        window.history.replaceState(null, "", "/auth/welcome");
        const { data } = await supabase.auth.getUser();
        setPhase(data.user ? "ready" : "invalid");
      } catch {
        setPhase("invalid");
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== form.get("confirm")) return setError("The two passwords don't match.");
    setBusy(true);
    const { error: e2 } = await createSupabaseBrowserClient().auth.updateUser({ password });
    setBusy(false);
    if (e2) return setError(e2.message);
    router.replace("/photographer");
    router.refresh();
  }

  if (phase === "checking") return <p>Checking your link…</p>;
  if (phase === "invalid")
    return (
      <p className="form-error">
        This link has expired or was already used. Ask for a new invite, or use “Forgot password?” on the sign-in page.
      </p>
    );
  return (
    <form onSubmit={onSubmit} className="stack-form">
      <label>
        New password
        <input name="password" type="password" autoComplete="new-password" minLength={8} required className="text-input" />
      </label>
      <label>
        Type it again
        <input name="confirm" type="password" autoComplete="new-password" minLength={8} required className="text-input" />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary-button" disabled={busy}>
        {busy ? "Saving…" : "Save password and continue"}
      </button>
    </form>
  );
}
