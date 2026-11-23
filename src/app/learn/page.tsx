import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function LearnHomePage() {
  const user = await requireUser();
  const locale = await getLocale(user.preferredLocale);
  const isEs = locale === "es";

  const [enrollmentsRes, certsRes] = await Promise.all([
    query<{
      enrollment_id: string;
      course_id: string;
      title_es: string;
      title_en: string;
      progress_pct: string;
      final_grade_pct: string | null;
      status: string;
    }>(
      `SELECT e.id AS enrollment_id, c.id AS course_id, c.title_es, c.title_en,
              e.progress_pct::text, e.final_grade_pct::text, e.status
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.student_id = $1 AND e.status <> 'dropped'
       ORDER BY e.enrolled_at DESC`,
      [user.id]
    ),
    query<{
      id: string;
      verification_code: string;
      course_title_es: string;
      course_title_en: string;
      issued_at: Date;
    }>(
      `SELECT cert.id, cert.verification_code, c.title_es AS course_title_es, c.title_en AS course_title_en, cert.issued_at
       FROM certificates cert
       JOIN courses c ON c.id = cert.course_id
       WHERE cert.student_id = $1 AND cert.revoked_at IS NULL
       ORDER BY cert.issued_at DESC`,
      [user.id]
    ),
  ]);

  return (
    <AppShell user={user} locale={locale} activePortal="learn">
      <div className="stack">
        <section className="card row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1>{isEs ? "Portal Estudiante" : "Student Portal"}</h1>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>
              {isEs
                ? "Recibe tus cursos, completa lecciones y evaluaciones, consulta tus notas y descarga tus certificados."
                : "Take your courses, complete lessons and quizzes, check your grades, and download certificates."}
            </p>
          </div>
          <Link href="/learn/certificates" className="btn btn-primary">
            {isEs ? `Mis certificados (${certsRes.rows.length})` : `My certificates (${certsRes.rows.length})`}
          </Link>
        </section>

        <section className="stack">
          <h2>{isEs ? "Mis cursos inscritos" : "My Enrolled Courses"}</h2>
          {enrollmentsRes.rows.length === 0 ? (
            <div className="card stack">
              <p>{isEs ? "No estás inscrito en ningún curso aún." : "You are not enrolled in any courses yet."}</p>
              <div>
                <Link href="/" className="btn btn-primary">
                  {isEs ? "Explorar catálogo" : "Browse catalog"}
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid-2">
              {enrollmentsRes.rows.map((e) => (
                <article key={e.enrollment_id} className="card stack">
                  <div>
                    <span className={`badge ${e.status === "completed" ? "badge-success" : ""}`}>
                      {e.status}
                    </span>
                    <h3 style={{ marginTop: "8px" }}>{isEs ? e.title_es : e.title_en}</h3>
                  </div>
                  <div>
                    <label htmlFor={`prog-${e.enrollment_id}`} className="hint">
                      {isEs ? `Progreso: ${e.progress_pct}%` : `Progress: ${e.progress_pct}%`}
                      {e.final_grade_pct !== null &&
                        ` · ${isEs ? "Nota" : "Grade"}: ${e.final_grade_pct}%`}
                    </label>
                    <progress
                      id={`prog-${e.enrollment_id}`}
                      value={Number(e.progress_pct)}
                      max={100}
                      style={{ width: "100%", height: "14px", marginTop: "6px" }}
                    />
                  </div>
                  <div>
                    <Link href={`/learn/courses/${e.course_id}`} className="btn btn-primary">
                      {isEs ? "Continuar curso" : "Continue course"}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
