import Link from "next/link";
import { hasStudioAccess, requireRole } from "@/lib/auth";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { TeacherStudioRequestCard } from "@/components/TeacherStudioRequestCard";

export const dynamic = "force-dynamic";

export default async function TeachHomePage() {
  const user = await requireRole(["teacher", "superadmin"]);
  const locale = await getLocale(user.preferredLocale);
  const isEs = locale === "es";

  const coursesRes = await query<{
    id: string;
    slug: string;
    title_es: string;
    title_en: string;
    status: string;
  }>(
    user.role === "superadmin"
      ? `SELECT id, slug, title_es, title_en, status FROM courses ORDER BY created_at DESC`
      : `SELECT c.id, c.slug, c.title_es, c.title_en, c.status
         FROM courses c
         JOIN course_teachers ct ON ct.course_id = c.id
         WHERE ct.teacher_id = $1
         ORDER BY c.created_at DESC`,
    user.role === "superadmin" ? [] : [user.id]
  );

  const pendingReqRes = await query<{ id: string }>(
    `SELECT id FROM capability_requests
     WHERE teacher_id = $1 AND capability = 'video_editor_enabled' AND status = 'pending' LIMIT 1`,
    [user.id]
  );

  const canStudio = hasStudioAccess(user);

  return (
    <AppShell user={user} locale={locale} activePortal="teach">
      <div className="stack">
        <section className="card stack">
          <h1>{isEs ? "Perfil de Docente" : "Teacher Portal"}</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            {isEs
              ? "Administra el contenido de tus cursos, genera materiales con Gemini IA o Google Workspace, crea evaluaciones y acompaña a tus estudiantes."
              : "Manage course content, generate materials with Gemini AI or Google Workspace, build assessments, and interact with students."}
          </p>
        </section>

        <TeacherStudioRequestCard
          canStudio={canStudio}
          hasPendingRequest={(pendingReqRes.rowCount ?? 0) > 0}
          locale={locale}
        />

        <section className="stack">
          <h2>{isEs ? "Cursos asignados" : "Assigned Courses"}</h2>
          {coursesRes.rows.length === 0 ? (
            <div className="card">
              <p>
                {isEs
                  ? "Aún no tienes cursos asignados. Solicita al superadministrador asignarte un curso desde /admin/courses."
                  : "No courses assigned yet. Ask the superadmin to assign a course in /admin/courses."}
              </p>
            </div>
          ) : (
            <div className="grid-2">
              {coursesRes.rows.map((c) => (
                <article key={c.id} className="card stack">
                  <div>
                    <span className="badge">{c.status}</span>
                    <h3 style={{ marginTop: "8px" }}>{isEs ? c.title_es : c.title_en}</h3>
                  </div>
                  <div className="row">
                    <Link href={`/teach/courses/${c.id}`} className="btn btn-primary">
                      {isEs ? "Currículo, IA y Google" : "Curriculum, AI & Google"}
                    </Link>
                    <Link href={`/teach/courses/${c.id}/assessments`} className="btn">
                      {isEs ? "Evaluaciones" : "Assessments"}
                    </Link>
                    <Link href={`/teach/courses/${c.id}/interactions`} className="btn">
                      {isEs ? "Foro y Mensajes" : "Q&A & Messages"}
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
