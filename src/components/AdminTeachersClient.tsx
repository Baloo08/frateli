"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n";

interface TeacherRow {
  id: string;
  email: string;
  full_name: string;
  status: string;
  preferred_locale: "es" | "en";
  video_editor_enabled: boolean;
  specialty_es: string | null;
}

export function AdminTeachersClient({
  initialTeachers,
  locale,
}: {
  initialTeachers: TeacherRow[];
  locale: Locale;
}) {
  const router = useRouter();
  const isEs = locale === "es";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [specialtyEs, setSpecialtyEs] = useState("");
  const [preferredLocale, setPreferredLocale] = useState<"es" | "en">("es");
  const [message, setMessage] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    setInviteLink(null);
    try {
      const res = await fetch("/api/admin/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          preferredLocale,
          specialtyEs: specialtyEs || undefined,
          tempPassword: tempPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error creating teacher");
        return;
      }
      setFullName("");
      setEmail("");
      setTempPassword("");
      setSpecialtyEs("");
      setInviteLink(data.inviteUrl || null);
      setMessage(
        isEs
          ? "Docente creado correctamente (y correo encolado si SMTP está activo)."
          : "Teacher created (and invite email queued if SMTP is configured)."
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(teacherId: string, nextStatus: "active" | "suspended") {
    const reason = window.prompt(
      isEs ? "Motivo de auditoría (mínimo 5 caracteres):" : "Audit reason (min 5 chars):"
    );
    if (!reason || reason.trim().length < 5) return;
    await fetch("/api/admin/teachers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId, status: nextStatus, reason }),
    });
    router.refresh();
  }

  return (
    <div className="stack">
      <section className="card stack">
        <h1>{isEs ? "Gestión de Docentes" : "Teacher Management"}</h1>
        <div aria-live="polite">
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {message && (
            <div className="alert alert-success">
              {message}
              {inviteLink && (
                <p style={{ marginTop: "8px", wordBreak: "break-all" }}>
                  <strong>{isEs ? "Enlace directo de invitación:" : "Direct invite URL:"}</strong>{" "}
                  <code>{inviteLink}</code>
                </p>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleCreate} className="grid-2">
          <div className="field">
            <label htmlFor="t-name">{isEs ? "Nombre completo" : "Full name"}</label>
            <input id="t-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="t-email">{isEs ? "Correo" : "Email"}</label>
            <input id="t-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="t-spec">{isEs ? "Especialidad" : "Specialty"}</label>
            <input id="t-spec" value={specialtyEs} onChange={(e) => setSpecialtyEs(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="t-loc">{isEs ? "Idioma preferido" : "Preferred language"}</label>
            <select id="t-loc" value={preferredLocale} onChange={(e) => setPreferredLocale(e.target.value as "es" | "en")}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-pw">{isEs ? "Contraseña inicial (opcional)" : "Initial password (optional)"}</label>
            <input
              id="t-pw"
              type="password"
              minLength={8}
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
            />
            <span className="hint">
              {isEs
                ? "Si la dejas vacía, se genera enlace de invitación por correo."
                : "If left blank, an email invite token link is generated."}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "14px" }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? (isEs ? "Creando..." : "Creating...") : isEs ? "Crear usuario docente" : "Create teacher user"}
            </button>
          </div>
        </form>
      </section>

      <div className="table-wrapper" tabIndex={0} role="region" aria-labelledby="teachers-cap">
        <table>
          <caption id="teachers-cap">{isEs ? "Listado de docentes" : "Teachers directory"}</caption>
          <thead>
            <tr>
              <th scope="col">{isEs ? "Nombre" : "Name"}</th>
              <th scope="col">{isEs ? "Correo" : "Email"}</th>
              <th scope="col">{isEs ? "Estado" : "Status"}</th>
              <th scope="col">Video Studio</th>
              <th scope="col">{isEs ? "Acciones" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {initialTeachers.map((t) => (
              <tr key={t.id}>
                <td>{t.full_name}</td>
                <td>{t.email}</td>
                <td>
                  <span className={`badge ${t.status === "active" ? "badge-success" : "badge-warning"}`}>
                    {t.status}
                  </span>
                </td>
                <td>
                  <span className={`badge ${t.video_editor_enabled ? "badge-success" : ""}`}>
                    {t.video_editor_enabled ? (isEs ? "Habilitado" : "Enabled") : isEs ? "Deshabilitado" : "Disabled"}
                  </span>
                </td>
                <td>
                  {t.status === "active" ? (
                    <button type="button" className="btn" onClick={() => toggleStatus(t.id, "suspended")}>
                      {isEs ? "Suspender" : "Suspend"}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={() => toggleStatus(t.id, "active")}>
                      {isEs ? "Activar" : "Activate"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
