"use client";

import { useState } from "react";

/** Shares (on phones) or copies (on desktop) the current page URL, including the ?car= filter. */
export function ShareButton({ title }: { title: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setStatus("failed");
    }
    setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <button type="button" className="share-button" onClick={share}>
      {status === "copied" ? "Link copied ✓" : status === "failed" ? "Couldn’t copy – use the address bar" : "Share this link"}
    </button>
  );
}
