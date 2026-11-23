"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n";

export function CourseInteractionsClient({
  course,
  posts,
  recipients,
  messages,
  locale,
}: {
  course: { id: string; title_es: string; title_en: string };
  posts: { id: string; author_name: string; body: string; created_at: string }[];
  recipients: { id: string; full_name: string; email: string }[];
  messages: { id: string; sender_name: string; recipient_name: string; body: string; created_at: string }[];
  locale: Locale;
}) {
  const router = useRouter();
  const isEs = locale === "es";
  const [postBody, setPostBody] = useState("");
  const [dmRecipient, setDmRecipient] = useState(recipients[0]?.id || "");
  const [dmBody, setDmBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitPost(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch(`/api/teach/courses/${course.id}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "post_discussion", body: postBody, contentLocale: locale }),
      });
      setPostBody("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitDm(e: React.FormEvent) {
    e.preventDefault();
    if (!dmRecipient) return;
    setBusy(true);
    try {
      await fetch(`/api/teach/courses/${course.id}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_dm",
          recipientId: dmRecipient,
          body: dmBody,
          contentLocale: locale,
        }),
      });
      setDmBody("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>{isEs ? "Interacción con Estudiantes (Foro y Mensajes 1:1)" : "Course Q&A & Direct Messages"}</h1>
        <p className="hint">{isEs ? course.title_es : course.title_en}</p>
      </section>

      <section className="grid-2">
        <div className="card stack">
          <h2>{isEs ? "Foro del curso" : "Course Q&A Forum"}</h2>
          <form onSubmit={submitPost}>
            <div className="field">
              <label htmlFor="qa-body">{isEs ? "Escribir mensaje o respuesta" : "Write post or reply"}</label>
              <textarea id="qa-body" required value={postBody} onChange={(e) => setPostBody(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {isEs ? "Publicar en foro" : "Post to forum"}
            </button>
          </form>

          <div className="stack">
            {posts.map((p) => (
              <article key={p.id} className="card" style={{ background: "var(--bg-muted)" }}>
                <strong>{p.author_name}</strong>
                <span className="hint" style={{ marginLeft: "8px" }}>{p.created_at.slice(0, 16).replace("T", " ")}</span>
                <p style={{ marginBottom: 0 }}>{p.body}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="card stack">
          <h2>{isEs ? "Mensajería directa 1:1" : "1:1 Direct Messages"}</h2>
          {recipients.length === 0 ? (
            <p className="hint">{isEs ? "No hay destinatarios disponibles aún." : "No recipients available yet."}</p>
          ) : (
            <form onSubmit={submitDm}>
              <div className="field">
                <label htmlFor="dm-rec">{isEs ? "Destinatario" : "Recipient"}</label>
                <select id="dm-rec" value={dmRecipient} onChange={(e) => setDmRecipient(e.target.value)}>
                  {recipients.map((r) => (
                    <option key={r.id} value={r.id}>{r.full_name} ({r.email})</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="dm-msg">{isEs ? "Mensaje privado" : "Private message"}</label>
                <textarea id="dm-msg" required value={dmBody} onChange={(e) => setDmBody(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {isEs ? "Enviar mensaje" : "Send message"}
              </button>
            </form>
          )}

          <div className="stack">
            {messages.map((m) => (
              <article key={m.id} className="card" style={{ background: "var(--bg-muted)" }}>
                <strong>{m.sender_name} → {m.recipient_name}</strong>
                <p style={{ marginBottom: 0 }}>{m.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
