import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { EnrollButton } from "@/components/EnrollButton";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser().catch(() => null);
  const locale = await getLocale(user?.preferredLocale);
  const isEs = locale === "es";

  const coursesRes = await query<{
    id: string;
    slug: string;
    title_es: string;
    title_en: string;
    description_es: string;
    description_en: string;
    passing_grade_pct: string;
  }>(
    `SELECT id, slug, title_es, title_en, description_es, description_en, passing_grade_pct::text
     FROM courses WHERE status = 'published' ORDER BY created_at DESC`
  ).catch(() => ({ rows: [] }));

  const enrolledIds = new Set<string>();
  if (user) {
    const enrRes = await query<{ course_id: string }>(
      `SELECT course_id FROM enrollments WHERE student_id = $1 AND status <> 'dropped'`,
      [user.id]
    ).catch(() => ({ rows: [] }));
    enrRes.rows.forEach((r) => enrolledIds.add(r.course_id));
  }

  return (
    <AppShell user={user} locale={locale} activePortal="catalog">
      <div className="stack">
        <section className="card">
          <h1>{isEs ? "Bienvenido a Frateli Campus Virtual" : "Welcome to Frateli Virtual Campus"}</h1>
          <p style={{ color: "var(--text-secondary)", maxWidth: "70ch" }}>
            {isEs
              ? "Plataforma de aprendizaje accesible (WCAG 2.1 AA), bilingüe (ES/EN), con creación asistida por Gemini IA, integración con Google Workspace/Drive, estudio de grabación de video y certificados verificables."
              : "Accessible learning platform (WCAG 2.1 AA), bilingual (ES/EN), featuring Gemini AI authoring, Google Workspace/Drive integration, built-in Video Studio, and verifiable certificates."}
          </p>
          {!user && (
            <div className="row" style={{ marginTop: "12px" }}>
              <Link href="/login" className="btn btn-primary">
                {isEs ? "Iniciar sesión o crear cuenta" : "Sign in or create account"}
              </Link>
            </div>
          )}
        </section>

        <section>
          <h2>{isEs ? "Catálogo de cursos habilitados" : "Available Published Courses"}</h2>
          {coursesRes.rows.length === 0 ? (
            <div className="card">
              <p>
                {isEs
                  ? "Aún no hay cursos publicados. El superadministrador puede crear o habilitar cursos en /admin."
                  : "No published courses yet. The superadmin can create or enable courses in /admin."}
              </p>
            </div>
          ) : (
            <div className="grid-2">
              {coursesRes.rows.map((course) => {
                const title = isEs ? course.title_es : course.title_en;
                const desc = isEs ? course.description_es : course.description_en;
                const isEnrolled = enrolledIds.has(course.id);

                return (
                  <article key={course.id} className="card stack">
                    <div>
                      <span className="badge badge-success">
                        {isEs ? `Nota mínima: ${course.passing_grade_pct}%` : `Passing grade: ${course.passing_grade_pct}%`}
                      </span>
                      <h3 style={{ marginTop: "8px", marginBottom: "6px" }}>{title}</h3>
                      <p style={{ color: "var(--text-secondary)", margin: 0 }}>{desc}</p>
                    </div>
                    <div className="row">
                      {isEnrolled ? (
                        <Link href={`/learn/courses/${course.id}`} className="btn btn-primary">
                          {isEs ? "Ir al curso" : "Open course"}
                        </Link>
                      ) : user ? (
                        <EnrollButton courseId={course.id} locale={locale} />
                      ) : (
                        <Link href="/login" className="btn btn-primary">
                          {isEs ? "Inscribirme" : "Enroll"}
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
