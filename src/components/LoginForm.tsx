"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n";

export function LoginForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const isEs = locale === "es";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login"
          ? { email, password }
          : { fullName, email, password, preferredLocale: locale };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (isEs ? "No se pudo completar la operación." : "Request failed."));
        return;
      }
      router.push(data.redirectTo || "/");
      router.refresh();
    } catch {
      setError(isEs ? "Error de red al conectar con Frateli." : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <div className="row" role="tablist" aria-label={isEs ? "Modo de acceso" : "Access mode"}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={`btn ${mode === "login" ? "btn-primary" : ""}`}
          onClick={() => {
            setMode("login");
            setError(null);
          }}
        >
          {isEs ? "Iniciar sesión" : "Sign in"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={`btn ${mode === "register" ? "btn-primary" : ""}`}
          onClick={() => {
            setMode("register");
            setError(null);
          }}
        >
          {isEs ? "Crear cuenta estudiante" : "Student sign up"}
        </button>
      </div>

      <h1>
        {mode === "login"
          ? isEs
            ? "Acceso a Frateli LMS"
            : "Sign in to Frateli LMS"
          : isEs
          ? "Registro de Estudiante"
          : "Student Registration"}
      </h1>

      <div aria-live="polite">
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} aria-label={mode === "login" ? "Login" : "Register"}>
        {mode === "register" && (
          <div className="field">
            <label htmlFor="fullName">{isEs ? "Nombre completo" : "Full name"}</label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="email">{isEs ? "Correo electrónico" : "Email address"}</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">{isEs ? "Contraseña" : "Password"}</label>
          <div className="row" style={{ alignItems: "stretch" }}>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 8 : 1}
              required
              style={{ flex: 1 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword
                ? isEs
                  ? "Ocultar"
                  : "Hide"
                : isEs
                ? "Mostrar"
                : "Show"}
            </button>
          </div>
          {mode === "register" && (
            <span className="hint">
              {isEs ? "Mínimo 8 caracteres." : "Minimum 8 characters."}
            </span>
          )}
        </div>

        <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: "100%" }}>
          {busy
            ? isEs
              ? "Procesando..."
              : "Processing..."
            : mode === "login"
            ? isEs
              ? "Entrar al Campus"
              : "Enter Campus"
            : isEs
            ? "Registrarme"
            : "Create account"}
        </button>
      </form>
    </section>
  );
}
