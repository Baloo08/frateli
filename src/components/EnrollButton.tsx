"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EnrollButton({ courseId, locale }: { courseId: string; locale: "es" | "en" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleEnroll() {
    setBusy(true);
    try {
      const res = await fetch("/api/learn/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      if (res.ok) {
        router.push(`/learn/courses/${courseId}`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-primary" onClick={handleEnroll} disabled={busy}>
      {busy
        ? locale === "es"
          ? "Inscribiendo..."
          : "Enrolling..."
        : locale === "es"
        ? "Inscribirme en el curso"
        : "Enroll in course"}
    </button>
  );
}
