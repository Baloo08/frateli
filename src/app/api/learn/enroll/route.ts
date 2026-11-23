import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const enrollSchema = z.object({
  courseId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid courseId" }, { status: 400 });
  }

  const courseRes = await query(`SELECT id FROM courses WHERE id = $1 AND status = 'published'`, [
    parsed.data.courseId,
  ]);
  if (!courseRes.rowCount) {
    return NextResponse.json({ error: "Course is not available for enrollment" }, { status: 404 });
  }

  const res = await query<{ id: string }>(
    `INSERT INTO enrollments (student_id, course_id, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'active'
     RETURNING id`,
    [user.id, parsed.data.courseId]
  );

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    portalContext: "learn",
    action: "enrollment.created",
    resourceType: "enrollment",
    resourceId: res.rows[0].id,
  });

  return NextResponse.json({ ok: true, enrollmentId: res.rows[0].id }, { status: 201 });
}
