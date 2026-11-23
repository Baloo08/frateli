import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessCourseAsStudent } from "@/lib/permissions";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { getSignedReadUrl } from "@/lib/storage";
import { renderSafeMarkdown } from "@/lib/markdown";
import { AppShell } from "@/components/AppShell";
import { StudentCourseClient } from "@/components/StudentCourseClient";

export const dynamic = "force-dynamic";

export default async function StudentCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lessonId?: string }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  const sp = await searchParams;

  if (!(await canAccessCourseAsStudent(user, courseId))) {
    redirect("/");
  }

  const locale = await getLocale(user.preferredLocale);

  const courseRes = await query<{
    id: string;
    title_es: string;
    title_en: string;
    passing_grade_pct: string;
  }>(`SELECT id, title_es, title_en, passing_grade_pct::text FROM courses WHERE id = $1`, [courseId]);
  const course = courseRes.rows[0];
  if (!course) notFound();

  const [enrRes, modulesRes, lessonsRes, assessmentsRes, calendarRes] = await Promise.all([
    query<{ id: string; progress_pct: string; final_grade_pct: string | null; status: string }>(
      `SELECT id, progress_pct::text, final_grade_pct::text, status
       FROM enrollments WHERE student_id = $1 AND course_id = $2 LIMIT 1`,
      [user.id, courseId]
    ),
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
      content_md_es: string | null;
      content_md_en: string | null;
      content_locale: "es" | "en";
      video_asset_id: string | null;
      mp4_fallback_key: string | null;
      vtt_es_key: string | null;
      vtt_en_key: string | null;
      storage_driver: "local" | "s3" | null;
    }>(
      `SELECT l.id, l.module_id, l.lesson_type, l.title_es, l.title_en,
              l.content_md_es, l.content_md_en, l.content_locale, l.video_asset_id,
              va.mp4_fallback_key, va.vtt_es_key, va.vtt_en_key, va.storage_driver
       FROM lessons l
       JOIN modules m ON m.id = l.module_id
       LEFT JOIN video_assets va ON va.id = l.video_asset_id
       WHERE m.course_id = $1 AND l.is_published = true
       ORDER BY m.sort_order ASC, l.sort_order ASC`,
      [courseId]
    ),
    query<{ id: string; title_es: string; title_en: string; passing_score_pct: string }>(
      `SELECT id, title_es, title_en, passing_score_pct::text
       FROM assessments WHERE course_id = $1 AND is_published = true ORDER BY created_at ASC`,
      [courseId]
    ),
    query<{ id: string; title: string; starts_at: Date; meet_link: string | null }>(
      `SELECT id, title, starts_at, meet_link FROM course_calendar_events WHERE course_id = $1 ORDER BY starts_at ASC`,
      [courseId]
    ),
  ]);

  const enrollment = enrRes.rows[0] ?? null;
  const completedSet = new Set<string>();
  if (enrollment) {
    const lpRes = await query<{ lesson_id: string }>(
      `SELECT lesson_id FROM lesson_progress WHERE enrollment_id = $1 AND is_completed = true`,
      [enrollment.id]
    );
    lpRes.rows.forEach((r) => completedSet.add(r.lesson_id));
  }

  const activeLesson =
    lessonsRes.rows.find((l) => l.id === sp.lessonId) || lessonsRes.rows[0] || null;

  let videoUrl: string | null = null;
  let vttUrl: string | null = null;
  let resources: { id: string; title: string; href: string; external: boolean }[] = [];

  if (activeLesson) {
    if (activeLesson.mp4_fallback_key && activeLesson.storage_driver) {
      videoUrl = await getSignedReadUrl(activeLesson.mp4_fallback_key, activeLesson.storage_driver);
    }
    const vttKey = locale === "en" ? activeLesson.vtt_en_key || activeLesson.vtt_es_key : activeLesson.vtt_es_key || activeLesson.vtt_en_key;
    if (vttKey && activeLesson.storage_driver) {
      vttUrl = await getSignedReadUrl(vttKey, activeLesson.storage_driver);
    }

    const resRows = await query<{
      id: string;
      title_es: string;
      title_en: string;
      storage_driver: "local" | "s3" | "external";
      file_key: string;
      external_web_url: string | null;
    }>(
      `SELECT id, title_es, title_en, storage_driver, file_key, external_web_url
       FROM lesson_resources WHERE lesson_id = $1 ORDER BY created_at ASC`,
      [activeLesson.id]
    );

    resources = await Promise.all(
      resRows.rows.map(async (r) => ({
        id: r.id,
        title: locale === "es" ? r.title_es : r.title_en,
        href:
          r.storage_driver === "external"
            ? r.external_web_url || r.file_key
            : await getSignedReadUrl(r.file_key, r.storage_driver),
        external: r.storage_driver === "external",
      }))
    );
  }

  // Load questions for active assessments (without correct_answer_json!)
  const assessmentsWithQuestions = await Promise.all(
    assessmentsRes.rows.map(async (a) => {
      const qRes = await query<{
        id: string;
        question_type: string;
        prompt_es: string;
        prompt_en: string;
        options_json: { es?: string[]; en?: string[] };
      }>(
        `SELECT id, question_type, prompt_es, prompt_en, options_json
         FROM assessment_questions WHERE assessment_id = $1 ORDER BY sort_order ASC`,
        [a.id]
      );
      return { ...a, questions: qRes.rows };
    })
  );

  const activeHtml = activeLesson
    ? renderSafeMarkdown(
        (locale === "es" ? activeLesson.content_md_es : activeLesson.content_md_en) ||
          activeLesson.content_md_es ||
          activeLesson.content_md_en ||
          ""
      )
    : "";

  return (
    <AppShell user={user} locale={locale} activePortal="learn">
      <div className="stack">
        <div className="row">
          <Link href="/learn" className="btn">← {locale === "es" ? "Mi Aprendizaje" : "My Learning"}</Link>
          <Link href="/learn/certificates" className="btn">
            {locale === "es" ? "Mis certificados" : "My certificates"}
          </Link>
        </div>

        <StudentCourseClient
          course={course}
          enrollment={enrollment}
          modules={modulesRes.rows}
          lessons={lessonsRes.rows.map((l) => ({
            id: l.id,
            module_id: l.module_id,
            lesson_type: l.lesson_type,
            title_es: l.title_es,
            title_en: l.title_en,
            completed: completedSet.has(l.id),
          }))}
          activeLesson={
            activeLesson
              ? {
                  id: activeLesson.id,
                  title: locale === "es" ? activeLesson.title_es : activeLesson.title_en,
                  contentLocale: activeLesson.content_locale,
                  htmlContent: activeHtml,
                  videoUrl,
                  vttUrl,
                  resources,
                  completed: completedSet.has(activeLesson.id),
                }
              : null
          }
          assessments={assessmentsWithQuestions}
          calendarEvents={calendarRes.rows.map((ev) => ({
            ...ev,
            starts_at: ev.starts_at.toISOString(),
          }))}
          locale={locale}
        />
      </div>
    </AppShell>
  );
}
