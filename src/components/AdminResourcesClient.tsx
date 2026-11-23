"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n";
import type { AiProviderStatus } from "@/lib/ai";

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
}

export function AdminResourcesClient({
  locale,
  storageDriver,
  initialAiStatus,
  smtpConfigured,
  smtpUser,
  googleOAuthConfigured,
  googleConnected,
  googleStatusParam,
}: {
  locale: Locale;
  storageDriver: "local" | "s3";
  initialAiStatus: AiProviderStatus;
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
  const router = useRouter();
  const isEs = locale === "es";

  // BYOK Gemini state
  const [aiStatus, setAiStatus] = useState<AiProviderStatus>(initialAiStatus);
  const [geminiKey, setGeminiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [textModel, setTextModel] = useState(initialAiStatus.textModel || "gemini-3.8-flash");
  const [imageModel, setImageModel] = useState(initialAiStatus.imageModel || "gemini-nano-banana-2.1");
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  // SMTP & Drive state
  const [testEmail, setTestEmail] = useState("");
  const [smtpResult, setSmtpResult] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveItem[]>([]);
  const [driveMsg, setDriveMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveByokKey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAiFeedback(null);
    try {
      const res = await fetch("/api/admin/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          apiKey: geminiKey || undefined,
          textModel,
          imageModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiFeedback(`Error: ${data.error}`);
        return;
      }
      setAiStatus(data.status);
      setGeminiKey("");
      setAiFeedback(
        isEs
          ? "Clave Gemini BYOK cifrada y guardada correctamente en PostgreSQL."
          : "BYOK Gemini key encrypted and saved in PostgreSQL."
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function testByokKey() {
    setBusy(true);
    setAiFeedback(null);
    try {
      const res = await fetch("/api/admin/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          apiKey: geminiKey || undefined,
          textModel,
          imageModel,
        }),
      });
      const data = await res.json();
      setAiFeedback(
        data.ok
          ? `Conexión Gemini OK (${data.model}: ${data.reply})`
          : `Error Gemini: ${data.error}`
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeByokKey() {
    setBusy(true);
    setAiFeedback(null);
    try {
      const res = await fetch("/api/admin/ai-settings", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setAiStatus(data.status);
        setAiFeedback(isEs ? "Clave BYOK eliminada." : "BYOK key removed.");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

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
        setDriveMsg(isEs ? `Carpeta raíz fijada: ${folderName}` : `Root folder saved: ${folderName}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>{isEs ? "Recursos, IA BYOK (Gemini), Google Workspace y SMTP" : "Resources, BYOK AI (Gemini), Google Workspace & SMTP"}</h1>
        {googleStatusParam === "connected" && (
          <div className="alert alert-success">
            {isEs ? "Cuenta de Google conectada correctamente." : "Google account connected successfully."}
          </div>
        )}
        {googleStatusParam === "missing_env" && (
          <div className="alert alert-error" role="alert">
            {isEs
              ? "Faltan GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET en EasyPanel."
              : "Missing GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in EasyPanel."}
          </div>
        )}
      </section>

      {/* BYOK Gemini API Card */}
      <section className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{isEs ? "Gemini API — Configuración BYOK (Superadmin)" : "Gemini API — BYOK Configuration (Superadmin)"}</h2>
          <span className={`badge ${aiStatus.configured ? "badge-success" : "badge-warning"}`}>
            {aiStatus.configured
              ? `${aiStatus.source.toUpperCase()} (${aiStatus.keyHint})`
              : isEs
              ? "Sin clave configurada"
              : "Not configured"}
          </span>
        </div>
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>
          {isEs
            ? "Ingresa tu propia API Key de Google AI Studio (Gemini). Se cifra con AES-256-GCM en PostgreSQL y habilita la generación de textos de apoyo estilo Napkin, diagramas e ítems de práctica para los docentes."
            : "Enter your own Google AI Studio (Gemini) API Key. It is encrypted with AES-256-GCM in PostgreSQL and powers Napkin-style study guides, diagrams, and practice items for teachers."}
        </p>

        <form onSubmit={saveByokKey} className="grid-3">
          <div className="field">
            <label htmlFor="byok-key">{isEs ? "Gemini API Key (BYOK)" : "Gemini API Key (BYOK)"}</label>
            <div className="row" style={{ alignItems: "stretch" }}>
              <input
                id="byok-key"
                type={showKey ? "text" : "password"}
                autoComplete="off"
                placeholder={aiStatus.keyHint ? `${aiStatus.keyHint} (dejar vacío para mantener)` : "AIza..."}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn" aria-pressed={showKey} onClick={() => setShowKey((s) => !s)}>
                {showKey ? (isEs ? "Ocultar" : "Hide") : isEs ? "Ver" : "Show"}
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="byok-text">{isEs ? "Modelo de Texto / Video" : "Text / Video Model"}</label>
            <select id="byok-text" value={textModel} onChange={(e) => setTextModel(e.target.value)}>
              <option value="gemini-3.8-flash">gemini-3.8-flash (Recomendado)</option>
              <option value="gemini-4-argon">gemini-4-argon (Máxima calidad)</option>
              <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Ultra rápido)</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="byok-img">{isEs ? "Modelo de Imágenes (Estilo Napkin)" : "Image Model (Napkin Style)"}</label>
            <select id="byok-img" value={imageModel} onChange={(e) => setImageModel(e.target.value)}>
              <option value="gemini-nano-banana-2.1">gemini-nano-banana-2.1 (Recomendado)</option>
              <option value="gemini-3-pro-image">gemini-3-pro-image (Alta fidelidad)</option>
              <option value="gemini-3.1-flash-lite-image">gemini-3.1-flash-lite-image (Rápido)</option>
            </select>
          </div>

          <div className="row" style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {isEs ? "Guardar clave BYOK" : "Save BYOK Key"}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={testByokKey}>
              {isEs ? "Probar conexión Gemini" : "Test Gemini Connection"}
            </button>
            {aiStatus.source === "byok" && (
              <button type="button" className="btn btn-danger" disabled={busy} onClick={removeByokKey}>
                {isEs ? "Eliminar clave BYOK" : "Remove BYOK Key"}
              </button>
            )}
          </div>
        </form>

        <div aria-live="polite">
          {aiFeedback && <div className="alert">{aiFeedback}</div>}
        </div>
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
          <h2>{isEs ? "Almacenamiento y Correo Google SMTP" : "Storage & Google SMTP Email"}</h2>
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
