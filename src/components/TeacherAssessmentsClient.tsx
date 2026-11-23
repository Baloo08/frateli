"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n";

export function TeacherAssessmentsClient({
  course,
  assessments,
  submissions,
  enrollments,
  locale,
}: {
  course: { id: string; title_es: string; title_en: string };
  assessments: { id: string; title_es: string; title_en: string; passing_score_pct: string }[];
  submissions: {
    id: string;
    student_name: string;
    assessment_title: string;
    attempt_no: number;
    final_score_pct: string | null;
    passed: boolean | null;
  }[];
  enrollments: {
    id: string;
    student_name: string;
    assessment_time_multiplier: string;
    assessment_untimed: boolean;
  }[];
  locale: Locale;
}) {
  const router = useRouter();
  const isEs = locale === "es";
  const [titleEs, setTitleEs] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [promptEs, setPromptEs] = useState("");
  const [opt1, setOpt1] = useState("");
  const [opt2, setOpt2] = useState("");
  const [opt3, setOpt3] = useState("");
  const [correctIdx, setCorrectIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  async function createQuickQuiz(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch(`/api/teach/courses/${course.id}/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_assessment",
          titleEs,
          titleEn: titleEn || titleEs,
          passingScorePct: 70,
          questions: [
            {
              questionType: "single_choice",
              promptEs,
              promptEn: promptEs,
              optionsEs: [opt1, opt2, opt3].filter(Boolean),
              optionsEn: [opt1, opt2, opt3].filter(Boolean),
              correctAnswer: correctIdx,
              points: 1,
            },
          ],
        }),
      });
      setTitleEs("");
      setTitleEn("");
      setPromptEs("");
      setOpt1("");
      setOpt2("");
      setOpt3("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function gradeSubmission(submissionId: string) {
    const score = Number(window.prompt(isEs ? "Nota final (0-100):" : "Final score (0-100):", "90"));
    if (Number.isNaN(score)) return;
    const feedback = window.prompt(isEs ? "Retroalimentación:" : "Feedback:", "") || "";
    await fetch(`/api/teach/courses/${course.id}/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "grade_submission",
        submissionId,
        manualScore: score,
        finalScorePct: score,
        passed: score >= 70,
        feedback,
      }),
    });
    router.refresh();
  }

  async function updateAccommodation(enrollmentId: string, timeMultiplier: number, untimed: boolean) {
    await fetch(`/api/teach/courses/${course.id}/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_accommodation",
        enrollmentId,
        timeMultiplier,
        untimed,
      }),
    });
    router.refresh();
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>{isEs ? "Evaluaciones y Calificaciones" : "Assessments & Grading"}</h1>
        <p className="hint">{isEs ? course.title_es : course.title_en}</p>
      </section>

      <section className="grid-2">
        <div className="card stack">
          <h2>{isEs ? "Crear evaluación rápida" : "Create Quick Assessment"}</h2>
          <form onSubmit={createQuickQuiz}>
            <div className="field">
              <label htmlFor="a-tes">{isEs ? "Título (ES)" : "Title (ES)"}</label>
              <input id="a-tes" required value={titleEs} onChange={(e) => setTitleEs(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="a-ten">{isEs ? "Título (EN)" : "Title (EN)"}</label>
              <input id="a-ten" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="a-q">{isEs ? "Pregunta 1" : "Question 1"}</label>
              <input id="a-q" required value={promptEs} onChange={(e) => setPromptEs(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="a-o1">{isEs ? "Opción A" : "Option A"}</label>
              <input id="a-o1" required value={opt1} onChange={(e) => setOpt1(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="a-o2">{isEs ? "Opción B" : "Option B"}</label>
              <input id="a-o2" required value={opt2} onChange={(e) => setOpt2(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="a-o3">{isEs ? "Opción C" : "Option C"}</label>
              <input id="a-o3" value={opt3} onChange={(e) => setOpt3(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="a-c">{isEs ? "Respuesta correcta" : "Correct option"}</label>
              <select id="a-c" value={correctIdx} onChange={(e) => setCorrectIdx(Number(e.target.value))}>
                <option value={0}>Opción A</option>
                <option value={1}>Opción B</option>
                <option value={2}>Opción C</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {isEs ? "Publicar evaluación" : "Publish assessment"}
            </button>
          </form>
        </div>

        <div className="card stack">
          <h2>{isEs ? "Evaluaciones publicadas" : "Published Assessments"}</h2>
          {assessments.length === 0 ? (
            <p className="hint">{isEs ? "Aún no hay evaluaciones." : "No assessments yet."}</p>
          ) : (
            <ul>
              {assessments.map((a) => (
                <li key={a.id}>
                  <strong>{isEs ? a.title_es : a.title_en}</strong> — {a.passing_score_pct}% min
                </li>
              ))}
            </ul>
          )}

          <h3>{isEs ? "Extensiones WCAG 2.2.1 (Tiempo)" : "WCAG 2.2.1 Time Accommodations"}</h3>
          {enrollments.map((enr) => (
            <div key={enr.id} className="row" style={{ justifyContent: "space-between" }}>
              <span>{enr.student_name}</span>
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => updateAccommodation(enr.id, 1.5, false)}
                >
                  1.5×
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => updateAccommodation(enr.id, 2.0, true)}
                >
                  {isEs ? "Sin límite" : "Untimed"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="table-wrapper" tabIndex={0} role="region" aria-labelledby="sub-cap">
        <table>
          <caption id="sub-cap">{isEs ? "Entregas de estudiantes" : "Student Submissions"}</caption>
          <thead>
            <tr>
              <th scope="col">{isEs ? "Estudiante" : "Student"}</th>
              <th scope="col">{isEs ? "Evaluación" : "Assessment"}</th>
              <th scope="col">{isEs ? "Intento" : "Attempt"}</th>
              <th scope="col">{isEs ? "Nota" : "Score"}</th>
              <th scope="col">{isEs ? "Acción" : "Action"}</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s.id}>
                <td>{s.student_name}</td>
                <td>{s.assessment_title}</td>
                <td>#{s.attempt_no}</td>
                <td>{s.final_score_pct !== null ? `${s.final_score_pct}%` : isEs ? "Pendiente" : "Pending"}</td>
                <td>
                  <button type="button" className="btn" onClick={() => gradeSubmission(s.id)}>
                    {isEs ? "Calificar / Ajustar" : "Grade / Override"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
