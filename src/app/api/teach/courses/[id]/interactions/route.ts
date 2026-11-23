import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCourseAsStudent } from "@/lib/permissions";
import { query } from "@/lib/db";

const interactionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("post_discussion"),
    lessonId: z.string().uuid().optional().nullable(),
    parentId: z.string().uuid().optional().nullable(),
    body: z.string().trim().min(1).max(4000),
    contentLocale: z.enum(["es", "en"]).default("es"),
  }),
  z.object({
    action: z.literal("send_dm"),
    recipientId: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
    contentLocale: z.enum(["es", "en"]).default("es"),
  }),
]);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: courseId } = await context.params;
  if (!(await canAccessCourseAsStudent(user, courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = interactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid interaction payload" }, { status: 400 });
  }

  const d = parsed.data;
  if (d.action === "post_discussion") {
    const res = await query<{ id: string }>(
      `INSERT INTO course_discussions (course_id, lesson_id, parent_id, author_id, content_locale, body)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [courseId, d.lessonId ?? null, d.parentId ?? null, user.id, d.contentLocale, d.body]
    );
    return NextResponse.json({ ok: true, id: res.rows[0].id }, { status: 201 });
  }

  const res = await query<{ id: string }>(
    `INSERT INTO direct_messages (course_id, sender_id, recipient_id, content_locale, body)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [courseId, user.id, d.recipientId, d.contentLocale, d.body]
  );
  return NextResponse.json({ ok: true, id: res.rows[0].id }, { status: 201 });
}
