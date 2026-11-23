import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { canManageCourse } from "@/lib/permissions";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { TeacherAssessmentsClient } from "@/components/TeacherAssessmentsClient";

export const dynamic = "force-dynamic";

export default async function TeacherAssessmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole(["teacher", "superadmin"]);
  const { id: courseId } = await params;
  if (!(await canManageCourse(user, courseId))) redirect("/teach");

  const locale = await getLocale(user.preferredLocale);
  const courseRes = await query<{ id: string; title_es: string; title_en: string }>(
    `SELECT id, title_es, title_en FROM courses WHERE id = $1`,
    [courseId]
  );
  const course = courseRes.rows[0];
  if (!course) notFound();

  const [assRes, subRes, enrRes] = await Promise.all([
    query<{ id: string; title_es: string; title_en: string; passing_score_pct: string }>(
      `SELECT id, title_es, title_en, passing_score_pct::text FROM assessments WHERE course_id = $1 ORDER BY created_at DESC`,
      [courseId]
    ),
    query<{
      id: string;
      student_name: string;
      assessment_title: string;
      attempt_no: number;
      final_score_pct: string | null;
      passed: boolean | null;
      answers_json: Record<string, unknown>;
    }>(
      `SELECT s.id, u.full_name AS student_name, a.title_es AS assessment_title,
              s.attempt_no, s.final_score_pct::text, s.passed, s.answers_json
       FROM assessment_submissions s
       JOIN assessments a ON a.id = s.assessment_id
       JOIN users u ON u.id = s.student_id
       WHERE a.course_id = $1
       ORDER BY s.submitted_at DESC LIMIT 30`,
      [courseId]
    ),
    query<{
      id: string;
      student_name: string;
      assessment_time_multiplier: string;
      assessment_untimed: boolean;
    }>(
      `SELECT e.id, u.full_name AS student_name, e.assessment_time_multiplier::text, e.assessment_untimed
       FROM enrollments e JOIN users u ON u.id = e.student_id
       WHERE e.course_id = $1 ORDER BY u.full_name ASC`,
      [courseId]
    ),
  ]);

  return (
    <AppShell user={user} locale={locale} activePortal="teach">
      <div className="stack">
        <div className="row">
          <Link href={`/teach/courses/${courseId}`} className="btn">
            ← {locale === "es" ? "Volver al curso" : "Back to course"}
          </Link>
        </div>
        <TeacherAssessmentsClient
          course={course}
          assessments={assRes.rows}
          submissions={subRes.rows}
          enrollments={enrRes.rows}
          locale={locale}
        />
      </div>
    </AppShell>
  );
}
