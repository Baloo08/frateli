import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, hasStudioAccess } from "@/lib/auth";
import { query } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const patchProjectSchema = z.object({
  title: z.string().trim().min(1).optional(),
  courseId: z.string().uuid().nullable().optional(),
  lessonId: z.string().uuid().nullable().optional(),
  edlJson: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !hasStudioAccess(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectId } = await context.params;
  const projRes = await query<{ owner_id: string }>(`SELECT owner_id FROM video_projects WHERE id = $1`, [
    projectId,
  ]);
  const project = projRes.rows[0];
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.owner_id !== user.id && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update payload" }, { status: 400 });
  }

  await query(
    `UPDATE video_projects
     SET title = COALESCE($2, title),
         course_id = COALESCE($3, course_id),
         lesson_id = COALESCE($4, lesson_id),
         edl_json = COALESCE($5, edl_json)
     WHERE id = $1`,
    [
      projectId,
      parsed.data.title ?? null,
      parsed.data.courseId === undefined ? null : parsed.data.courseId,
      parsed.data.lessonId === undefined ? null : parsed.data.lessonId,
      parsed.data.edlJson ? JSON.stringify(parsed.data.edlJson) : null,
    ]
  );

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    portalContext: "studio",
    action: "video_project.edl_saved",
    resourceType: "video_project",
    resourceId: projectId,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
