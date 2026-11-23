"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn"
      onClick={handleLogout}
      disabled={busy}
      style={{ minHeight: "38px" }}
    >
      {label}
    </button>
  );
}
