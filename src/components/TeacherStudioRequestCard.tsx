"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n";

export function TeacherStudioRequestCard({
  canStudio,
  hasPendingRequest,
  locale,
}: {
  canStudio: boolean;
  hasPendingRequest: boolean;
  locale: Locale;
}) {
  const router = useRouter();
  const isEs = locale === "es";
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (canStudio) {
    return (
      <section className="card row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>{isEs ? "Video Studio habilitado" : "Video Studio Enabled"}</h2>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)" }}>
            {isEs
              ? "Puedes grabar y editar video lecciones directamente desde la plataforma."
              : "You can record and edit video lessons directly inside the platform."}
          </p>
        </div>
        <Link href="/studio" className="btn btn-primary">
          {isEs ? "Abrir Video Studio (/studio)" : "Open Video Studio (/studio)"}
        </Link>
      </section>
    );
  }

  async function requestAccess(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/teach/studio-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ justification }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Error");
        return;
      }
      setMsg(isEs ? "Solicitud enviada al superadministrador." : "Request sent to superadmin.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2>{isEs ? "Portal de Edición de Video (/studio)" : "Video Editing Studio (/studio)"}</h2>
      {hasPendingRequest ? (
        <div className="alert">
          {isEs
            ? "Tu solicitud para usar Video Studio está pendiente de aprobación por el superadministrador."
            : "Your request to use Video Studio is pending superadmin approval."}
        </div>
      ) : (
        <form onSubmit={requestAccess} className="stack">
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="studio-just">
              {isEs
                ? "Solicitar habilitación al superadministrador (mín. 10 caracteres)"
                : "Request access from superadmin (min 10 chars)"}
            </label>
            <input
              id="studio-just"
              required
              minLength={10}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder={
                isEs
                  ? "Ej. Necesito grabar las 4 videoclases introductorias del módulo 1."
                  : "E.g. Need to record introductory video lessons for module 1."
              }
            />
          </div>
          {msg && <div className="alert">{msg}</div>}
          <div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "..." : isEs ? "Solicitar acceso a Video Studio" : "Request Video Studio Access"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
