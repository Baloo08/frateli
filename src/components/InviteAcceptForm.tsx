"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n";

export function InviteAcceptForm({ token, locale }: { token: string; locale: Locale }) {
  const router = useRouter();
  const isEs = locale === "es";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid invitation");
        return;
      }
      router.push(data.redirectTo || "/teach");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h1>{isEs ? "Activar cuenta docente" : "Activate Teacher Account"}</h1>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="new-pw">{isEs ? "Nueva contraseña" : "New password"}</label>
          <input
            id="new-pw"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="hint">{isEs ? "Mínimo 8 caracteres." : "Minimum 8 characters."}</span>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? (isEs ? "Activando..." : "Activating...") : isEs ? "Activar y entrar" : "Activate & Sign In"}
        </button>
      </form>
    </section>
  );
}
