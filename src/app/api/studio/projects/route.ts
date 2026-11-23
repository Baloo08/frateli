import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, hasStudioAccess } from "@/lib/auth";
import { query } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  courseId: z.string().uuid().optional().nullable(),
  lessonId: z.string().uuid().optional().nullable(),
  contentLocale: z.enum(["es", "en"]).default("es"),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasStudioAccess(user)) {
    return NextResponse.json({ error: "Forbidden: Video Studio not enabled" }, { status: 403 });
  }

  const res = await query(
    `SELECT vp.*, va.status AS asset_status, va.mp4_fallback_key, va.vtt_es_key, va.vtt_en_key
     FROM video_projects vp
     LEFT JOIN video_assets va ON va.id = vp.latest_asset_id
     WHERE ($1 = 'superadmin' OR vp.owner_id = $2)
     ORDER BY vp.updated_at DESC`,
    [user.role, user.id]
  );

  return NextResponse.json({ projects: res.rows });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasStudioAccess(user)) {
    return NextResponse.json({ error: "Forbidden: Video Studio not enabled" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project payload" }, { status: 400 });
  }

  const res = await query<{ id: string }>(
    `INSERT INTO video_projects (owner_id, course_id, lesson_id, title, content_locale)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      user.id,
      parsed.data.courseId ?? null,
      parsed.data.lessonId ?? null,
      parsed.data.title,
      parsed.data.contentLocale,
    ]
  );

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    portalContext: "studio",
    action: "video_project.created",
    resourceType: "video_project",
    resourceId: res.rows[0].id,
  });

  return NextResponse.json({ ok: true, projectId: res.rows[0].id }, { status: 201 });
}
