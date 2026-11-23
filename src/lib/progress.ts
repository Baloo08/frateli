import { query } from "./db";
import { issueCertificateForEnrollment } from "./certificates";

export async function recalculateEnrollmentAndMaybeIssueCertificate(enrollmentId: string) {
  const enrRes = await query<{
    id: string;
    student_id: string;
    course_id: string;
    passing_grade_pct: string;
    final_grade_pct: string | null;
  }>(
    `SELECT e.id, e.student_id, e.course_id, c.passing_grade_pct::text, e.final_grade_pct::text
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.id = $1`,
    [enrollmentId]
  );
  const enr = enrRes.rows[0];
  if (!enr) return null;

  const lessonCounts = await query<{ total: string; completed: string }>(
    `SELECT
       COUNT(l.id)::text AS total,
       COUNT(lp.id) FILTER (WHERE lp.is_completed = true)::text AS completed
     FROM lessons l
     JOIN modules m ON m.id = l.module_id
     LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.enrollment_id = $1
     WHERE m.course_id = $2 AND l.is_published = true`,
    [enr.id, enr.course_id]
  );

  const totalLessons = Number(lessonCounts.rows[0]?.total ?? "0");
  const completedLessons = Number(lessonCounts.rows[0]?.completed ?? "0");
  const progressPct = totalLessons > 0 ? Math.min(100, Number(((completedLessons / totalLessons) * 100).toFixed(2))) : 100;

  // Check published assessments count
  const assessmentCountRes = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM assessments WHERE course_id = $1 AND is_published = true`,
    [enr.course_id]
  );
  const hasAssessments = Number(assessmentCountRes.rows[0]?.count ?? "0") > 0;

  let effectiveGrade = enr.final_grade_pct ? Number(enr.final_grade_pct) : null;
  if (!hasAssessments && progressPct === 100 && effectiveGrade === null) {
    effectiveGrade = 100;
  }

  const passingThreshold = Number(enr.passing_grade_pct);
  const completedCourse =
    progressPct >= 100 && effectiveGrade !== null && effectiveGrade >= passingThreshold;

  await query(
    `UPDATE enrollments
     SET progress_pct = $2,
         final_grade_pct = COALESCE($3, final_grade_pct),
         status = CASE WHEN $4 THEN 'completed' ELSE status END,
         completed_at = CASE WHEN $4 AND completed_at IS NULL THEN now() ELSE completed_at END
     WHERE id = $1`,
    [enr.id, progressPct, effectiveGrade, completedCourse]
  );

  let certificate: { id: string; verification_code: string } | null = null;
  if (completedCourse) {
    certificate = await issueCertificateForEnrollment(enr.id);
  }

  return { progressPct, finalGradePct: effectiveGrade, completedCourse, certificate };
}
