import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasStudioAccess, requireRole } from "@/lib/auth";
import { canManageCourse } from "@/lib/permissions";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { isAiConfigured } from "@/lib/ai";
import { getActiveGoogleIntegration } from "@/lib/google";
import { AppShell } from "@/components/AppShell";
import { TeacherCourseClient } from "@/components/TeacherCourseClient";

export const dynamic = "force-dynamic";

export default async function TeacherCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole(["teacher", "superadmin"]);
  const { id: courseId } = await params;

  if (!(await canManageCourse(user, courseId))) {
    redirect("/teach");
  }

  const locale = await getLocale(user.preferredLocale);

  const courseRes = await query<{ id: string; title_es: string; title_en: string }>(
    `SELECT id, title_es, title_en FROM courses WHERE id = $1`,
    [courseId]
  );
  const course = courseRes.rows[0];
  if (!course) notFound();

  const [modulesRes, lessonsRes, resourcesRes, calendarRes, googleIntegration] = await Promise.all([
    query<{ id: string; title_es: string; title_en: string; sort_order: number }>(
      `SELECT id, title_es, title_en, sort_order FROM modules WHERE course_id = $1 ORDER BY sort_order ASC`,
      [courseId]
    ),
    query<{
      id: string;
      module_id: string;
      lesson_type: string;
      title_es: string;
      title_en: string;
      sort_order: number;
      video_asset_id: string | null;
    }>(
      `SELECT l.id, l.module_id, l.lesson_type, l.title_es, l.title_en, l.sort_order, l.video_asset_id
       FROM lessons l JOIN modules m ON m.id = l.module_id
       WHERE m.course_id = $1 ORDER BY m.sort_order ASC, l.sort_order ASC`,
      [courseId]
    ),
    query<{
      id: string;
      lesson_id: string;
      title_es: string;
      title_en: string;
      source_provider: string;
      external_web_url: string | null;
    }>(
      `SELECT r.id, r.lesson_id, r.title_es, r.title_en, r.source_provider, r.external_web_url
       FROM lesson_resources r
       JOIN lessons l ON l.id = r.lesson_id
       JOIN modules m ON m.id = l.module_id
       WHERE m.course_id = $1 ORDER BY r.created_at DESC`,
      [courseId]
    ),
    query<{ id: string; title: string; starts_at: Date; meet_link: string | null; html_link: string | null }>(
      `SELECT id, title, starts_at, meet_link, html_link
       FROM course_calendar_events WHERE course_id = $1 ORDER BY starts_at ASC`,
      [courseId]
    ),
    getActiveGoogleIntegration().catch(() => null),
  ]);

  return (
    <AppShell user={user} locale={locale} activePortal="teach">
      <div className="stack">
        <div className="row">
          <Link href="/teach" className="btn">← {locale === "es" ? "Mis cursos" : "My courses"}</Link>
          <Link href={`/teach/courses/${courseId}/assessments`} className="btn">
            {locale === "es" ? "Evaluaciones y notas" : "Assessments & Grading"}
          </Link>
          <Link href={`/teach/courses/${courseId}/interactions`} className="btn">
            {locale === "es" ? "Foro y mensajes" : "Q&A & Messages"}
          </Link>
        </div>

        <TeacherCourseClient
          course={course}
          modules={modulesRes.rows}
          lessons={lessonsRes.rows}
          resources={resourcesRes.rows}
          calendarEvents={calendarRes.rows.map((e) => ({ ...e, starts_at: e.starts_at.toISOString() }))}
          aiConfigured={isAiConfigured()}
          googleConnected={Boolean(googleIntegration)}
          canStudio={hasStudioAccess(user)}
          locale={locale}
        />
      </div>
    </AppShell>
  );
}
