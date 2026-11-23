"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n";

export function StudentCourseClient({
  course,
  enrollment,
  modules,
  lessons,
  activeLesson,
  assessments,
  calendarEvents,
  locale,
}: {
  course: { id: string; title_es: string; title_en: string; passing_grade_pct: string };
  enrollment: { id: string; progress_pct: string; final_grade_pct: string | null; status: string } | null;
  modules: { id: string; title_es: string; title_en: string }[];
  lessons: {
    id: string;
    module_id: string;
    lesson_type: string;
    title_es: string;
    title_en: string;
    completed: boolean;
  }[];
  activeLesson: {
    id: string;
    title: string;
    contentLocale: "es" | "en";
    htmlContent: string;
    videoUrl: string | null;
    vttUrl: string | null;
    resources: { id: string; title: string; href: string; external: boolean }[];
    completed: boolean;
  } | null;
  assessments: {
    id: string;
    title_es: string;
    title_en: string;
    passing_score_pct: string;
    questions: {
      id: string;
      question_type: string;
      prompt_es: string;
      prompt_en: string;
      options_json: { es?: string[]; en?: string[] };
    }[];
  }[];
  calendarEvents: { id: string; title: string; starts_at: string; meet_link: string | null }[];
  locale: Locale;
}) {
  const router = useRouter();
  const isEs = locale === "es";
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function markComplete() {
    if (!activeLesson) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/learn/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: course.id,
          lessonId: activeLesson.id,
          isCompleted: true,
        }),
      });
      const data = await res.json();
      if (data.certificate) {
        setStatusMsg(
          isEs
            ? `¡Curso completado! Certificado emitido: ${data.certificate.verification_code}`
            : `Course completed! Certificate issued: ${data.certificate.verification_code}`
        );
      } else {
        setStatusMsg(isEs ? "Lección marcada como completada." : "Lesson marked complete.");
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitQuiz(assessmentId: string) {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/learn/assessments/${assessmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(data.error || "Error");
        return;
      }
      setStatusMsg(
        data.pendingManualReview
          ? isEs
            ? "Evaluación enviada para calificación docente."
            : "Assessment submitted for teacher grading."
          : isEs
          ? `Nota obtenida: ${data.finalScorePct}% (${data.passed ? "Aprobado" : "No aprobado"})`
          : `Score: ${data.finalScorePct}% (${data.passed ? "Passed" : "Not passed"})`
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="card row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>{isEs ? course.title_es : course.title_en}</h1>
          {enrollment && (
            <p className="hint" style={{ margin: 0 }}>
              {isEs ? `Progreso: ${enrollment.progress_pct}%` : `Progress: ${enrollment.progress_pct}%`}
              {enrollment.final_grade_pct !== null &&
                ` · ${isEs ? "Nota actual" : "Current grade"}: ${enrollment.final_grade_pct}%`}
            </p>
          )}
        </div>
        <div className="row">
          <Link href={`/learn/courses/${course.id}/interactions`} className="btn">
            {isEs ? "Foro y Mensajes" : "Q&A & Messages"}
          </Link>
          {enrollment?.status === "completed" && (
            <Link href="/learn/certificates" className="btn btn-primary">
              {isEs ? "Descargar certificado" : "Download certificate"}
            </Link>
          )}
        </div>
      </section>

      <div aria-live="polite">
        {statusMsg && <div className="alert alert-success">{statusMsg}</div>}
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "minmax(260px, 320px) 1fr", alignItems: "start" }}>
        {/* Course Outline */}
        <aside className="card stack" aria-label={isEs ? "Temario del curso" : "Course syllabus"}>
          <h2>{isEs ? "Contenido" : "Syllabus"}</h2>
          {modules.map((m) => (
            <div key={m.id}>
              <h3 style={{ fontSize: "1rem", marginBottom: "6px" }}>{isEs ? m.title_es : m.title_en}</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">
                {lessons
                  .filter((l) => l.module_id === m.id)
                  .map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`/learn/courses/${course.id}?lessonId=${l.id}`}
                        className="nav-link"
                        aria-current={activeLesson?.id === l.id ? "page" : undefined}
                        style={{ justifyContent: "space-between", width: "100%" }}
                      >
                        <span>{isEs ? l.title_es : l.title_en}</span>
                        <span>{l.completed ? "✓" : ""}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}

          {calendarEvents.length > 0 && (
            <div>
              <h3 style={{ fontSize: "1rem" }}>{isEs ? "Sesiones en vivo" : "Live Sessions"}</h3>
              <ul style={{ paddingLeft: "18px" }}>
                {calendarEvents.map((ev) => (
                  <li key={ev.id}>
                    {ev.title}
                    {ev.meet_link && (
                      <> — <a href={ev.meet_link} target="_blank" rel="noreferrer">Meet</a></>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Active Lesson & Assessments */}
        <div className="stack">
          {activeLesson ? (
            <article className="card stack" lang={activeLesson.contentLocale}>
              <h2>{activeLesson.title}</h2>

              {activeLesson.videoUrl && (
                <video
                  controls
                  preload="metadata"
                  style={{ width: "100%", borderRadius: "8px", background: "#000" }}
                >
                  <source src={activeLesson.videoUrl} />
                  {activeLesson.vttUrl && (
                    <track
                      src={activeLesson.vttUrl}
                      kind="captions"
                      srcLang={activeLesson.contentLocale}
                      label={activeLesson.contentLocale === "es" ? "Español" : "English"}
                      default
                    />
                  )}
                </video>
              )}

              {activeLesson.htmlContent && (
                <div
                  className="prose"
                  dangerouslySetInnerHTML={{ __html: activeLesson.htmlContent }}
                />
              )}

              {activeLesson.resources.length > 0 && (
                <section>
                  <h3>{isEs ? "Materiales descargables" : "Downloadable Resources"}</h3>
                  <ul>
                    {activeLesson.resources.map((r) => (
                      <li key={r.id}>
                        <a href={r.href} target="_blank" rel="noreferrer">
                          {r.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || activeLesson.completed}
                  onClick={markComplete}
                >
                  {activeLesson.completed
                    ? isEs
                      ? "Lección completada ✓"
                      : "Lesson completed ✓"
                    : isEs
                    ? "Marcar lección completada"
                    : "Mark lesson complete"}
                </button>
              </div>
            </article>
          ) : (
            <div className="card">
              <p>{isEs ? "Este curso aún no tiene lecciones publicadas." : "No published lessons yet."}</p>
            </div>
          )}

          {assessments.map((ass) => (
            <section key={ass.id} className="card stack">
              <h2>{isEs ? ass.title_es : ass.title_en}</h2>
              <p className="hint">
                {isEs ? `Nota mínima para aprobar: ${ass.passing_score_pct}%` : `Passing score: ${ass.passing_score_pct}%`}
              </p>
              {ass.questions.map((q, qIdx) => {
                const opts = (isEs ? q.options_json.es : q.options_json.en) || q.options_json.es || [];
                return (
                  <fieldset key={q.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "12px" }}>
                    <legend style={{ fontWeight: 700 }}>
                      {qIdx + 1}. {isEs ? q.prompt_es : q.prompt_en || q.prompt_es}
                    </legend>
                    {q.question_type === "short_answer" ? (
                      <textarea
                        style={{ width: "100%", minHeight: "80px" }}
                        onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      />
                    ) : (
                      <div className="stack" style={{ gap: "8px" }}>
                        {opts.map((opt, idx) => (
                          <label key={idx} className="row" style={{ cursor: "pointer" }}>
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              onChange={() => setAnswers({ ...answers, [q.id]: idx })}
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                );
              })}
              <div>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => submitQuiz(ass.id)}>
                  {isEs ? "Enviar evaluación" : "Submit assessment"}
                </button>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
