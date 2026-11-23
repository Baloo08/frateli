import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { recalculateEnrollmentAndMaybeIssueCertificate } from "@/lib/progress";

const submitSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assessmentId } = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission payload" }, { status: 400 });
  }

  const assRes = await query<{
    id: string;
    course_id: string;
    passing_score_pct: string;
    max_attempts: number;
  }>(`SELECT id, course_id, passing_score_pct::text, max_attempts FROM assessments WHERE id = $1`, [
    assessmentId,
  ]);
  const assessment = assRes.rows[0];
  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

  const enrRes = await query<{ id: string }>(
    `SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2`,
    [user.id, assessment.course_id]
  );
  const enrollment = enrRes.rows[0];
  if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 403 });

  const attemptsRes = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM assessment_submissions WHERE assessment_id = $1 AND student_id = $2`,
    [assessmentId, user.id]
  );
  const attemptNo = Number(attemptsRes.rows[0]?.count ?? "0") + 1;
  if (attemptNo > assessment.max_attempts) {
    return NextResponse.json({ error: "Maximum attempts reached" }, { status: 400 });
  }

  const qRes = await query<{
    id: string;
    question_type: string;
    correct_answer_json: unknown;
    points: string;
  }>(
    `SELECT id, question_type, correct_answer_json, points::text
     FROM assessment_questions WHERE assessment_id = $1 ORDER BY sort_order ASC`,
    [assessmentId]
  );

  let totalPoints = 0;
  let earnedAuto = 0;
  let hasShortAnswer = false;

  for (const q of qRes.rows) {
    const pts = Number(q.points);
    totalPoints += pts;
    const given = parsed.data.answers[q.id];

    if (q.question_type === "short_answer") {
      hasShortAnswer = true;
      continue;
    }

    if (JSON.stringify(given) === JSON.stringify(q.correct_answer_json) || String(given) === String(q.correct_answer_json)) {
      earnedAuto += pts;
    }
  }

  const autoScorePct = totalPoints > 0 ? Number(((earnedAuto / totalPoints) * 100).toFixed(2)) : 100;
  const finalPct = hasShortAnswer ? null : autoScorePct;
  const passed = finalPct !== null ? finalPct >= Number(assessment.passing_score_pct) : null;

  const subRes = await query<{ id: string }>(
    `INSERT INTO assessment_submissions (
       assessment_id, student_id, attempt_no, answers_json, auto_score, final_score_pct, passed
     ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [assessmentId, user.id, attemptNo, JSON.stringify(parsed.data.answers), earnedAuto, finalPct, passed]
  );

  if (finalPct !== null) {
    await query(
      `UPDATE enrollments
       SET final_grade_pct = GREATEST(COALESCE(final_grade_pct, 0), $2)
       WHERE id = $1`,
      [enrollment.id, finalPct]
    );
  }

  const summary = await recalculateEnrollmentAndMaybeIssueCertificate(enrollment.id);

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    portalContext: "learn",
    action: "assessment.submitted",
    resourceType: "assessment_submission",
    resourceId: subRes.rows[0].id,
    metadata: { attemptNo, autoScore: earnedAuto, finalPct, passed },
  });

  return NextResponse.json({
    ok: true,
    submissionId: subRes.rows[0].id,
    attemptNo,
    finalScorePct: finalPct,
    passed,
    pendingManualReview: hasShortAnswer,
    certificate: summary?.certificate ?? null,
  });
}
