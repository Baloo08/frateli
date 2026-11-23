"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n";

interface TeacherStudioRow {
  id: string;
  full_name: string;
  email: string;
  video_editor_enabled: boolean;
}

interface StudioRequestRow {
  id: string;
  teacher_id: string;
  teacher_name: string;
  teacher_email: string;
  justification: string;
  status: string;
  created_at: string;
}

export function AdminStudioAccessClient({
  teachers,
  requests,
  locale,
}: {
  teachers: TeacherStudioRow[];
  requests: StudioRequestRow[];
  locale: Locale;
}) {
  const router = useRouter();
  const isEs = locale === "es";
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleStudio(teacherId: string, enabled: boolean, requestId?: string) {
    const reason = (reasons[requestId || teacherId] || "").trim();
    if (reason.length < 10) {
      setError(
        isEs
          ? "Debes escribir un motivo de al menos 10 caracteres antes de habilitar o revocar."
          : "You must enter an audit reason of at least 10 characters."
      );
      return;
    }
    setError(null);
    setBusyId(requestId || teacherId);
    try {
      const res = await fetch("/api/admin/studio-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, enabled, reason, requestId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update Studio permission");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>{isEs ? "Control de Acceso al Video Studio (/studio)" : "Video Studio Access Control (/studio)"}</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          {isEs
            ? "Inicialmente solo el Superadministrador tiene acceso a /studio. Aquí puedes habilitarlo o revocarlo para docentes específicos con auditoría obligatoria."
            : "Initially only Superadmin has access to /studio. Enable or revoke teacher access here with mandatory audit logging."}
        </p>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
      </section>

      {requests.some((r) => r.status === "pending") && (
        <section className="card stack">
          <h2>{isEs ? "Solicitudes pendientes de docentes" : "Pending Teacher Requests"}</h2>
          {requests
            .filter((r) => r.status === "pending")
            .map((req) => (
              <div key={req.id} className="card stack" style={{ background: "var(--bg-muted)" }}>
                <strong>{req.teacher_name} ({req.teacher_email})</strong>
                <p style={{ margin: 0 }}>{req.justification}</p>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor={`req-${req.id}`}>
                    {isEs ? "Nota de resolución (mín. 10 caracteres)" : "Resolution note (min 10 chars)"}
                  </label>
                  <input
                    id={`req-${req.id}`}
                    value={reasons[req.id] || ""}
                    onChange={(e) => setReasons({ ...reasons, [req.id]: e.target.value })}
                    placeholder={isEs ? "Ej. Autorizado para grabar módulos del curso..." : "E.g. Approved for course recording..."}
                  />
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyId === req.id}
                    onClick={() => toggleStudio(req.teacher_id, true, req.id)}
                  >
                    {isEs ? "Aprobar y habilitar /studio" : "Approve & Enable /studio"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busyId === req.id}
                    onClick={() => toggleStudio(req.teacher_id, false, req.id)}
                  >
                    {isEs ? "Rechazar" : "Reject"}
                  </button>
                </div>
              </div>
            ))}
        </section>
      )}

      <div className="table-wrapper" tabIndex={0} role="region" aria-labelledby="studio-teachers-cap">
        <table>
          <caption id="studio-teachers-cap">
            {isEs ? "Permisos por docente" : "Teacher Video Studio Permissions"}
          </caption>
          <thead>
            <tr>
              <th scope="col">{isEs ? "Docente" : "Teacher"}</th>
              <th scope="col">{isEs ? "Estado /studio" : "/studio Status"}</th>
              <th scope="col">{isEs ? "Motivo (mín. 10 chars)" : "Audit Reason (min 10 chars)"}</th>
              <th scope="col">{isEs ? "Acción" : "Action"}</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.full_name}</strong>
                  <div className="hint">{t.email}</div>
                </td>
                <td>
                  <span className={`badge ${t.video_editor_enabled ? "badge-success" : ""}`}>
                    {t.video_editor_enabled ? (isEs ? "Habilitado" : "Enabled") : isEs ? "Bloqueado" : "Locked"}
                  </span>
                </td>
                <td>
                  <label className="visually-hidden" htmlFor={`reason-${t.id}`}>
                    {isEs ? `Motivo para ${t.full_name}` : `Reason for ${t.full_name}`}
                  </label>
                  <input
                    id={`reason-${t.id}`}
                    style={{ minHeight: "40px", padding: "6px 10px", width: "100%" }}
                    value={reasons[t.id] || ""}
                    onChange={(e) => setReasons({ ...reasons, [t.id]: e.target.value })}
                    placeholder={isEs ? "Motivo obligatorio..." : "Mandatory reason..."}
                  />
                </td>
                <td>
                  {t.video_editor_enabled ? (
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={busyId === t.id}
                      onClick={() => toggleStudio(t.id, false)}
                    >
                      {isEs ? "Revocar acceso" : "Revoke access"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busyId === t.id}
                      onClick={() => toggleStudio(t.id, true)}
                    >
                      {isEs ? "Habilitar /studio" : "Enable /studio"}
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
