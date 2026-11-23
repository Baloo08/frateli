"use client";

import { useState } from "react";
import type { Locale } from "@/i18n";

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
}

export function AdminResourcesClient({
  locale,
  storageDriver,
  aiConfigured,
  aiModel,
  smtpConfigured,
  smtpUser,
  googleOAuthConfigured,
  googleConnected,
  googleStatusParam,
}: {
  locale: Locale;
  storageDriver: "local" | "s3";
  aiConfigured: boolean;
  aiModel: string;
  smtpConfigured: boolean;
  smtpUser: string | null;
  googleOAuthConfigured: boolean;
  googleConnected: {
    accountEmail: string;
    rootFolderId: string | null;
    rootFolderName: string | null;
  } | null;
  googleStatusParam: string | null;
}) {
  const isEs = locale === "es";
  const [testEmail, setTestEmail] = useState("");
  const [smtpResult, setSmtpResult] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveItem[]>([]);
  const [driveMsg, setDriveMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendSmtpTest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSmtpResult(null);
    try {
      const res = await fetch("/api/admin/smtp-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: testEmail }),
      });
      const data = await res.json();
      setSmtpResult(data.ok ? `OK (${data.messageId})` : `Error: ${data.error}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadDriveFolders() {
    setBusy(true);
    setDriveMsg(null);
    try {
      const res = await fetch("/api/integrations/google/drive");
      const data = await res.json();
      setDriveFiles(data.files || []);
      if (data.error) setDriveMsg(data.error);
    } finally {
      setBusy(false);
    }
  }

  async function selectRootFolder(folderId: string, folderName: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/google/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_root_folder", folderId, folderName }),
      });
      if (res.ok) {
        setDriveMsg(
          isEs
            ? `Carpeta raíz fijada: ${folderName}`
            : `Root folder saved: ${folderName}`
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>{isEs ? "Recursos, Google Workspace / Drive, IA y SMTP" : "Resources, Google Workspace / Drive, AI & SMTP"}</h1>
        {googleStatusParam === "connected" && (
          <div className="alert alert-success">
            {isEs ? "Cuenta de Google conectada correctamente." : "Google account connected successfully."}
          </div>
        )}
        {googleStatusParam === "missing_env" && (
          <div className="alert alert-error" role="alert">
            {isEs
              ? "Faltan GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET en las variables de entorno de EasyPanel."
              : "Missing GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in EasyPanel environment variables."}
          </div>
        )}
      </section>

      <section className="grid-2">
        <div className="card stack">
          <h2>Google Drive / Docs / Slides / Sheets / Calendar</h2>
          <p style={{ color: "var(--text-secondary)" }}>
            {googleConnected
              ? `${isEs ? "Conectado como" : "Connected as"}: ${googleConnected.accountEmail}`
              : isEs
              ? "No hay cuenta de Google conectada aún."
              : "No Google account connected yet."}
          </p>
          {googleConnected?.rootFolderName && (
            <p className="badge badge-success">
              {isEs ? "Carpeta raíz:" : "Root folder:"} {googleConnected.rootFolderName}
            </p>
          )}
          <div className="row">
            <a href="/api/integrations/google/connect" className="btn btn-primary">
              {googleConnected
                ? isEs
                  ? "Reconectar cuenta Google"
                  : "Reconnect Google account"
                : isEs
                ? "Conectar cuenta Google"
                : "Connect Google account"}
            </a>
            {googleConnected && (
              <button type="button" className="btn" onClick={loadDriveFolders} disabled={busy}>
                {isEs ? "Explorar carpetas de Drive" : "Browse Drive folders"}
              </button>
            )}
          </div>
          {!googleOAuthConfigured && (
            <span className="hint">
              {isEs
                ? "Configura GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET en EasyPanel."
                : "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in EasyPanel."}
            </span>
          )}
          {driveMsg && <div className="alert">{driveMsg}</div>}
          {driveFiles.length > 0 && (
            <ul style={{ paddingLeft: "18px" }}>
              {driveFiles.map((f) => (
                <li key={f.id} style={{ marginBottom: "8px" }}>
                  <span>{f.name}</span>{" "}
                  {f.mimeType === "application/vnd.google-apps.folder" && (
                    <button
                      type="button"
                      className="btn"
                      style={{ minHeight: "32px", padding: "2px 8px", marginLeft: "8px" }}
                      onClick={() => selectRootFolder(f.id, f.name)}
                    >
                      {isEs ? "Usar como carpeta raíz" : "Set as root folder"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card stack">
          <h2>{isEs ? "Estado del Motor de IA y Almacenamiento" : "AI Engine & Storage Status"}</h2>
          <p>
            <strong>Gemini IA:</strong>{" "}
            <span className={`badge ${aiConfigured ? "badge-success" : "badge-warning"}`}>
              {aiConfigured ? `${aiModel} (Activo)` : "Falta GEMINI_API_KEY"}
            </span>
          </p>
          <p>
            <strong>{isEs ? "Driver de almacenamiento:" : "Storage driver:"}</strong>{" "}
            <span className="badge badge-success">{storageDriver.toUpperCase()}</span>
          </p>

          <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)" }} />

          <h3>{isEs ? "Prueba de correo Google SMTP" : "Google SMTP Email Test"}</h3>
          <p className="hint">
            {smtpConfigured ? `SMTP_USER: ${smtpUser}` : "Configura SMTP_USER y SMTP_APP_PASSWORD en EasyPanel."}
          </p>
          <form onSubmit={sendSmtpTest} className="row">
            <label htmlFor="smtp-test" className="visually-hidden">
              {isEs ? "Correo destino" : "Recipient email"}
            </label>
            <input
              id="smtp-test"
              type="email"
              required
              placeholder="tu-correo@ejemplo.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              style={{ flex: 1, minHeight: "44px", padding: "8px 12px" }}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !smtpConfigured}>
              {isEs ? "Enviar prueba" : "Send test"}
            </button>
          </form>
          {smtpResult && <div className="alert">{smtpResult}</div>}
        </div>
      </section>
    </div>
  );
}
