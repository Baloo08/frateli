import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { recalculateEnrollmentAndMaybeIssueCertificate } from "@/lib/progress";

const progressSchema = z.object({
  courseId: z.string().uuid(),
  lessonId: z.string().uuid(),
  watchedSec: z.coerce.number().int().min(0).default(0),
  lastPositionSec: z.coerce.number().int().min(0).default(0),
  isCompleted: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = progressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid progress payload" }, { status: 400 });
  }

  const enrRes = await query<{ id: string }>(
    `SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2 LIMIT 1`,
    [user.id, parsed.data.courseId]
  );
  const enr = enrRes.rows[0];
  if (!enr) {
    return NextResponse.json({ error: "Not enrolled in this course" }, { status: 403 });
  }

  await query(
    `INSERT INTO lesson_progress (enrollment_id, lesson_id, watched_sec, last_position_sec, is_completed, completed_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN now() ELSE NULL END)
     ON CONFLICT (enrollment_id, lesson_id)
     DO UPDATE SET
       watched_sec = GREATEST(lesson_progress.watched_sec, EXCLUDED.watched_sec),
       last_position_sec = EXCLUDED.last_position_sec,
       is_completed = lesson_progress.is_completed OR EXCLUDED.is_completed,
       completed_at = COALESCE(lesson_progress.completed_at, CASE WHEN EXCLUDED.is_completed THEN now() ELSE NULL END)`,
    [
      enr.id,
      parsed.data.lessonId,
      parsed.data.watchedSec,
      parsed.data.lastPositionSec,
      parsed.data.isCompleted,
    ]
  );

  const summary = await recalculateEnrollmentAndMaybeIssueCertificate(enr.id);
  return NextResponse.json({ ok: true, ...summary });
}
