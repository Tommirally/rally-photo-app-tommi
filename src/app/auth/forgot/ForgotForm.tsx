"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    await createSupabaseBrowserClient().auth.resetPasswordForEmail(String(new FormData(e.currentTarget).get("email") ?? "").trim(), {
      redirectTo: `${window.location.origin}/auth/welcome`,
    });
    setBusy(false);
    setSent(true); // Same message either way, so this page can't reveal who has an account.
  }
  if (sent) return <p>If that email has a login, a reset link is on its way. If nothing arrives, ask the organiser to reset it.</p>;
  return (
    <form onSubmit={onSubmit} className="stack-form">
      <label>
        Email
        <input name="email" type="email" required autoComplete="email" className="text-input" />
      </label>
      <button type="submit" className="primary-button" disabled={busy}>
        {busy ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}
