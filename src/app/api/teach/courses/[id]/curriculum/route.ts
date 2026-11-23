import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { canManageCourse } from "@/lib/permissions";
import { query, withTransaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const curriculumSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_module"),
    titleEs: z.string().trim().min(1),
    titleEn: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("create_lesson"),
    moduleId: z.string().uuid(),
    lessonType: z.enum(["video", "article", "quiz"]),
    titleEs: z.string().trim().min(1),
    titleEn: z.string().trim().min(1),
    contentMdEs: z.string().optional(),
    contentMdEn: z.string().optional(),
    contentLocale: z.enum(["es", "en"]).default("es"),
  }),
  z.object({
    action: z.literal("move_lesson"),
    lessonId: z.string().uuid(),
    direction: z.enum(["up", "down"]),
  }),
  z.object({
    action: z.literal("delete_lesson"),
    lessonId: z.string().uuid(),
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
  const parsed = curriculumSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid curriculum action" }, { status: 400 });
  }

  const data = parsed.data;

  if (data.action === "create_module") {
    const maxRes = await query<{ next_order: number }>(
      `SELECT COALESCE(MAX(sort_order) + 1, 0)::int AS next_order FROM modules WHERE course_id = $1`,
      [courseId]
    );
    const modRes = await query<{ id: string }>(
      `INSERT INTO modules (course_id, title_es, title_en, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [courseId, data.titleEs, data.titleEn, maxRes.rows[0].next_order]
    );
    return NextResponse.json({ ok: true, moduleId: modRes.rows[0].id }, { status: 201 });
  }

  if (data.action === "create_lesson") {
    const maxRes = await query<{ next_order: number }>(
      `SELECT COALESCE(MAX(sort_order) + 1, 0)::int AS next_order FROM lessons WHERE module_id = $1`,
      [data.moduleId]
    );
    const lesRes = await query<{ id: string }>(
      `INSERT INTO lessons (module_id, lesson_type, title_es, title_en, content_md_es, content_md_en, content_locale, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        data.moduleId,
        data.lessonType,
        data.titleEs,
        data.titleEn,
        data.contentMdEs ?? "",
        data.contentMdEn ?? "",
        data.contentLocale,
        maxRes.rows[0].next_order,
      ]
    );
    return NextResponse.json({ ok: true, lessonId: lesRes.rows[0].id }, { status: 201 });
  }

  if (data.action === "move_lesson") {
    await withTransaction(async (client) => {
      const curRes = await client.query<{ id: string; module_id: string; sort_order: number }>(
        `SELECT l.id, l.module_id, l.sort_order
         FROM lessons l
         JOIN modules m ON m.id = l.module_id
         WHERE l.id = $1 AND m.course_id = $2`,
        [data.lessonId, courseId]
      );
      const cur = curRes.rows[0];
      if (!cur) return;

      const op = data.direction === "up" ? "<" : ">";
      const ord = data.direction === "up" ? "DESC" : "ASC";
      const neighborRes = await client.query<{ id: string; sort_order: number }>(
        `SELECT id, sort_order FROM lessons
         WHERE module_id = $1 AND sort_order ${op} $2
         ORDER BY sort_order ${ord} LIMIT 1`,
        [cur.module_id, cur.sort_order]
      );
      const neighbor = neighborRes.rows[0];
      if (!neighbor) return;

      await client.query(`UPDATE lessons SET sort_order = $2 WHERE id = $1`, [cur.id, neighbor.sort_order]);
      await client.query(`UPDATE lessons SET sort_order = $2 WHERE id = $1`, [neighbor.id, cur.sort_order]);
    });

    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      portalContext: "teach",
      action: "curriculum.reordered",
      resourceType: "course",
      resourceId: courseId,
    });
    return NextResponse.json({ ok: true });
  }

  if (data.action === "delete_lesson") {
    await query(
      `DELETE FROM lessons l USING modules m
       WHERE l.module_id = m.id AND l.id = $1 AND m.course_id = $2`,
      [data.lessonId, courseId]
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
