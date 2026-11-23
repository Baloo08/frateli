import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { canManageCourse } from "@/lib/permissions";
import { query, withTransaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { enqueueEmail } from "@/lib/email";

const assessmentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_assessment"),
    titleEs: z.string().trim().min(2),
    titleEn: z.string().trim().min(2),
    passingScorePct: z.coerce.number().min(1).max(100).default(70),
    timeLimitMin: z.coerce.number().int().positive().nullable().optional(),
    questions: z
      .array(
        z.object({
          questionType: z.enum(["single_choice", "multi_choice", "true_false", "short_answer"]),
          promptEs: z.string().min(2),
          promptEn: z.string().min(2),
          optionsEs: z.array(z.string()).default([]),
          optionsEn: z.array(z.string()).default([]),
          correctAnswer: z.unknown(),
          explanationEs: z.string().optional(),
          explanationEn: z.string().optional(),
          points: z.coerce.number().positive().default(1),
        })
      )
      .min(1),
  }),
  z.object({
    action: z.literal("grade_submission"),
    submissionId: z.string().uuid(),
    manualScore: z.coerce.number().min(0),
    finalScorePct: z.coerce.number().min(0).max(100),
    passed: z.boolean(),
    feedback: z.string().optional(),
  }),
  z.object({
    action: z.literal("set_accommodation"),
    enrollmentId: z.string().uuid(),
    timeMultiplier: z.coerce.number().refine((v) => v === 1 || v === 1.5 || v === 2),
    untimed: z.boolean(),
  }),
]);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: courseId } = await context.params;
  if (!(await canManageCourse(user, courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = assessmentActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid assessment payload" }, { status: 400 });
  }

  const d = parsed.data;

  if (d.action === "create_assessment") {
    const assessmentId = await withTransaction(async (client) => {
      const aRes = await client.query<{ id: string }>(
        `INSERT INTO assessments (course_id, title_es, title_en, passing_score_pct, time_limit_min, is_published)
         VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
        [courseId, d.titleEs, d.titleEn, d.passingScorePct, d.timeLimitMin ?? null]
      );
      const id = aRes.rows[0].id;

      for (let i = 0; i < d.questions.length; i++) {
        const q = d.questions[i];
        await client.query(
          `INSERT INTO assessment_questions (
             assessment_id, question_type, prompt_es, prompt_en, options_json,
             correct_answer_json, explanation_es, explanation_en, points, sort_order
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            id,
            q.questionType,
            q.promptEs,
            q.promptEn,
            JSON.stringify({ es: q.optionsEs, en: q.optionsEn }),
            JSON.stringify(q.correctAnswer),
            q.explanationEs ?? null,
            q.explanationEn ?? null,
            q.points,
            i,
          ]
        );
      }

      return id;
    });

    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      portalContext: "teach",
      action: "assessment.published",
      resourceType: "assessment",
      resourceId: assessmentId,
    });

    return NextResponse.json({ ok: true, assessmentId }, { status: 201 });
  }

  if (d.action === "grade_submission") {
    const subRes = await query<{ student_id: string; email: string; full_name: string; preferred_locale: "es" | "en" }>(
      `UPDATE assessment_submissions s
       SET manual_score = $2,
           final_score_pct = $3,
           passed = $4,
           teacher_feedback = $5,
           graded_by = $6,
           graded_at = now()
       FROM users u
       WHERE s.id = $1 AND u.id = s.student_id
       RETURNING s.student_id, u.email, u.full_name, u.preferred_locale`,
      [d.submissionId, d.manualScore, d.finalScorePct, d.passed, d.feedback ?? null, user.id]
    );

    const sub = subRes.rows[0];
    if (sub) {
      await query(
        `UPDATE enrollments SET final_grade_pct = $3 WHERE student_id = $1 AND course_id = $2`,
        [sub.student_id, courseId, d.finalScorePct]
      );
      await enqueueEmail({
        recipientUserId: sub.student_id,
        recipientEmail: sub.email,
        templateKey: "quiz_graded",
        locale: sub.preferred_locale,
        payload: {
          subject: sub.preferred_locale === "es" ? "Tu evaluación ha sido calificada" : "Your assessment has been graded",
          message:
            sub.preferred_locale === "es"
              ? `Nota final: ${d.finalScorePct}%. ${d.feedback || ""}`
              : `Final score: ${d.finalScorePct}%. ${d.feedback || ""}`,
        },
      }).catch(() => undefined);
    }

    return NextResponse.json({ ok: true });
  }

  if (d.action === "set_accommodation") {
    await query(
      `UPDATE enrollments
       SET assessment_time_multiplier = $2, assessment_untimed = $3
       WHERE id = $1 AND course_id = $4`,
      [d.enrollmentId, d.timeMultiplier, d.untimed, courseId]
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
