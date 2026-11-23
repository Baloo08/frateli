import { requireStudioAccess } from "@/lib/auth";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { isAiConfigured } from "@/lib/ai";
import { AppShell } from "@/components/AppShell";
import { VideoStudioClient } from "@/components/VideoStudioClient";

export const dynamic = "force-dynamic";

export default async function VideoStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; lessonId?: string }>;
}) {
  const user = await requireStudioAccess();
  const locale = await getLocale(user.preferredLocale);
  const sp = await searchParams;

  const [coursesRes, lessonsRes, projectsRes] = await Promise.all([
    query<{ id: string; title_es: string; title_en: string }>(
      user.role === "superadmin"
        ? `SELECT id, title_es, title_en FROM courses ORDER BY created_at DESC`
        : `SELECT c.id, c.title_es, c.title_en
           FROM courses c JOIN course_teachers ct ON ct.course_id = c.id
           WHERE ct.teacher_id = $1 ORDER BY c.created_at DESC`,
      user.role === "superadmin" ? [] : [user.id]
    ),
    query<{ id: string; course_id: string; title_es: string; title_en: string }>(
      `SELECT l.id, m.course_id, l.title_es, l.title_en
       FROM lessons l JOIN modules m ON m.id = l.module_id
       ORDER BY m.sort_order ASC, l.sort_order ASC`
    ),
    query<{ id: string; title: string; status: string; created_at: Date }>(
      `SELECT id, title, status, created_at FROM video_projects
       WHERE ($1 = 'superadmin' OR owner_id = $2)
       ORDER BY updated_at DESC LIMIT 10`,
      [user.role, user.id]
    ),
  ]);

  return (
    <AppShell user={user} locale={locale} activePortal="studio" theme="studio">
      <VideoStudioClient
        courses={coursesRes.rows}
        lessons={lessonsRes.rows}
        recentProjects={projectsRes.rows.map((p) => ({
          ...p,
          created_at: p.created_at.toISOString(),
        }))}
        initialCourseId={sp.courseId || coursesRes.rows[0]?.id || ""}
        initialLessonId={sp.lessonId || ""}
        aiConfigured={isAiConfigured()}
        locale={locale}
      />
    </AppShell>
  );
}
