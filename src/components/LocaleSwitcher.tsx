"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n";

export function LocaleSwitcher({ currentLocale }: { currentLocale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggleLocale(nextLocale: Locale) {
    if (nextLocale === currentLocale || busy) return;
    setBusy(true);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row" role="group" aria-label={currentLocale === "es" ? "Idioma de interfaz" : "Interface language"}>
      <button
        type="button"
        className={`btn ${currentLocale === "es" ? "btn-primary" : ""}`}
        aria-pressed={currentLocale === "es"}
        onClick={() => toggleLocale("es")}
        disabled={busy}
        style={{ minHeight: "36px", padding: "4px 10px" }}
      >
        ES
      </button>
      <button
        type="button"
        className={`btn ${currentLocale === "en" ? "btn-primary" : ""}`}
        aria-pressed={currentLocale === "en"}
        onClick={() => toggleLocale("en")}
        disabled={busy}
        style={{ minHeight: "36px", padding: "4px 10px" }}
      >
        EN
      </button>
    </div>
  );
}
