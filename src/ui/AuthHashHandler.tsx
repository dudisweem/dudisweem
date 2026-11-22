"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Consumes implicit-flow email links (#access_token=…&type=recovery|signup) on any page:
 * stores the session in cookies, strips the tokens from the address bar immediately,
 * then routes: recovery → /reset, otherwise → /auth/continue (role-based landing).
 */
export function AuthHashHandler() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash || !(hash.includes("access_token=") || hash.includes("error="))) return;
    const p = new URLSearchParams(hash);
    // never leave tokens in history
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    if (p.get("error")) {
      window.location.replace("/login?state=expired");
      return;
    }
    const access_token = p.get("access_token");
    const refresh_token = p.get("refresh_token");
    const type = p.get("type");
    if (!access_token || !refresh_token) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot status while the session is stored
    setMsg(type === "recovery" ? "פותחים את איפוס הסיסמה…" : "מאשרים את החשבון…");
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) window.location.replace("/login?state=expired");
        else window.location.replace(type === "recovery" ? "/reset" : "/auth/continue");
      });
  }, []);

  if (!msg) return null;
  return (
    <div role="status" style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(14,47,75,.92)", color: "#fff", display: "grid", placeItems: "center", font: "700 18px var(--f-ui)" }}>
      {msg}
    </div>
  );
}
