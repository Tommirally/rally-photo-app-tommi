"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { error: signInError } = await createSupabaseBrowserClient().auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    setBusy(false);
    if (signInError) {
      setError("That email and password didn’t match. Check them, or ask the organiser to reset your password.");
      return;
    }
    router.replace("/photographer");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="stack-form">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required className="text-input" />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required className="text-input" />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary-button" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
