import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const createCourseSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  titleEs: z.string().trim().min(3),
  titleEn: z.string().trim().min(3),
  descriptionEs: z.string().trim().min(5),
  descriptionEn: z.string().trim().min(5),
  contentLocale: z.enum(["es", "en"]).default("es"),
  passingGradePct: z.coerce.number().min(1).max(100).default(70),
  teacherId: z.string().uuid().optional(),
  publishNow: z.boolean().default(true),
});

const patchCourseSchema = z.object({
  courseId: z.string().uuid(),
  status: z.enum(["draft", "pending_review", "published", "archived"]).optional(),
  assignTeacherId: z.string().uuid().optional(),
  reason: z.string().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const res = await query(
    `SELECT c.*,
            COALESCE(
              json_agg(json_build_object('id', u.id, 'fullName', u.full_name, 'email', u.email))
              FILTER (WHERE u.id IS NOT NULL),
              '[]'
            ) AS teachers
     FROM courses c
     LEFT JOIN course_teachers ct ON ct.course_id = c.id
     LEFT JOIN users u ON u.id = ct.teacher_id
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  );

  return NextResponse.json({ courses: res.rows });
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createCourseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid course payload" }, { status: 400 });
  }

  const status = parsed.data.publishNow ? "published" : "draft";

  const courseId = await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO courses (
         slug, title_es, title_en, description_es, description_en, content_locale,
         passing_grade_pct, status, created_by, enabled_by, enabled_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        parsed.data.slug,
        parsed.data.titleEs,
        parsed.data.titleEn,
        parsed.data.descriptionEs,
        parsed.data.descriptionEn,
        parsed.data.contentLocale,
        parsed.data.passingGradePct,
        status,
        admin.id,
        parsed.data.publishNow ? admin.id : null,
        parsed.data.publishNow ? new Date() : null,
      ]
    );
    const id = res.rows[0].id;

    if (parsed.data.teacherId) {
      await client.query(
        `INSERT INTO course_teachers (course_id, teacher_id, is_primary, assigned_by)
         VALUES ($1, $2, true, $3)`,
        [id, parsed.data.teacherId, admin.id]
      );
    }

    return id;
  });

  await logAudit({
    actorId: admin.id,
    actorRole: admin.role,
    portalContext: "admin",
    action: parsed.data.publishNow ? "course.enabled" : "course.created",
    resourceType: "course",
    resourceId: courseId,
    afterState: { slug: parsed.data.slug, status },
  });

  return NextResponse.json({ ok: true, courseId }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchCourseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  if (parsed.data.status) {
    await query(
      `UPDATE courses
       SET status = $2,
           enabled_by = CASE WHEN $2 = 'published' THEN $3 ELSE enabled_by END,
           enabled_at = CASE WHEN $2 = 'published' THEN now() ELSE enabled_at END
       WHERE id = $1`,
      [parsed.data.courseId, parsed.data.status, admin.id]
    );

    await logAudit({
      actorId: admin.id,
      actorRole: admin.role,
      portalContext: "admin",
      action:
        parsed.data.status === "published"
          ? "course.enabled"
          : parsed.data.status === "archived"
          ? "course.archived"
          : "course.rejected",
      resourceType: "course",
      resourceId: parsed.data.courseId,
      reason: parsed.data.reason ?? null,
      afterState: { status: parsed.data.status },
    });
  }

  if (parsed.data.assignTeacherId) {
    await query(
      `INSERT INTO course_teachers (course_id, teacher_id, is_primary, assigned_by)
       VALUES ($1, $2, false, $3)
       ON CONFLICT (course_id, teacher_id) DO NOTHING`,
      [parsed.data.courseId, parsed.data.assignTeacherId, admin.id]
    );

    await logAudit({
      actorId: admin.id,
      actorRole: admin.role,
      portalContext: "admin",
      action: "course.teacher_assigned",
      resourceType: "course_teacher",
      resourceId: `${parsed.data.courseId}:${parsed.data.assignTeacherId}`,
    });
  }

  return NextResponse.json({ ok: true });
}
