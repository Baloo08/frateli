import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { invalidateUserRbacCache } from "@/lib/redis";
import { logAudit } from "@/lib/audit";
import { enqueueEmail } from "@/lib/email";

const toggleSchema = z.object({
  teacherId: z.string().uuid(),
  enabled: z.boolean(),
  reason: z.string().trim().min(10, "Reason must be at least 10 characters"),
  requestId: z.string().uuid().optional(),
});

export async function GET() {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [teachersRes, requestsRes, grantsRes] = await Promise.all([
    query(
      `SELECT id, full_name, email, status, video_editor_enabled, preferred_locale
       FROM users WHERE role = 'teacher' ORDER BY full_name ASC`
    ),
    query(
      `SELECT cr.*, u.full_name AS teacher_name, u.email AS teacher_email
       FROM capability_requests cr
       JOIN users u ON u.id = cr.teacher_id
       ORDER BY cr.created_at DESC LIMIT 50`
    ),
    query(
      `SELECT cg.*, t.full_name AS target_name, a.full_name AS actor_name
       FROM capability_grants cg
       JOIN users t ON t.id = cg.target_user_id
       JOIN users a ON a.id = cg.actor_user_id
       ORDER BY cg.created_at DESC LIMIT 30`
    ),
  ]);

  return NextResponse.json({
    teachers: teachersRes.rows,
    requests: requestsRes.rows,
    grants: grantsRes.rows,
  });
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Reason (>= 10 characters) and valid teacherId are required" },
      { status: 400 }
    );
  }

  const target = await withTransaction(async (client) => {
    const tRes = await client.query<{
      id: string;
      email: string;
      full_name: string;
      preferred_locale: "es" | "en";
      video_editor_enabled: boolean;
    }>(
      `SELECT id, email, full_name, preferred_locale, video_editor_enabled
       FROM users WHERE id = $1 AND role = 'teacher' FOR UPDATE`,
      [parsed.data.teacherId]
    );
    const teacher = tRes.rows[0];
    if (!teacher) return null;

    await client.query(`UPDATE users SET video_editor_enabled = $2 WHERE id = $1`, [
      teacher.id,
      parsed.data.enabled,
    ]);

    await client.query(
      `INSERT INTO capability_grants (target_user_id, capability, granted, actor_user_id, reason)
       VALUES ($1, 'video_editor_enabled', $2, $3, $4)`,
      [teacher.id, parsed.data.enabled, admin.id, parsed.data.reason]
    );

    if (parsed.data.requestId) {
      await client.query(
        `UPDATE capability_requests
         SET status = $2, reviewed_by = $3, review_note = $4, reviewed_at = now()
         WHERE id = $1 AND status = 'pending'`,
        [
          parsed.data.requestId,
          parsed.data.enabled ? "approved" : "rejected",
          admin.id,
          parsed.data.reason,
        ]
      );
    }

    return teacher;
  });

  if (!target) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  await invalidateUserRbacCache(target.id);

  await logAudit({
    actorId: admin.id,
    actorRole: admin.role,
    portalContext: "admin",
    action: "capability.video_editor_toggled",
    resourceType: "user",
    resourceId: target.id,
    reason: parsed.data.reason,
    beforeState: { video_editor_enabled: target.video_editor_enabled },
    afterState: { video_editor_enabled: parsed.data.enabled },
  });

  await enqueueEmail({
    recipientUserId: target.id,
    recipientEmail: target.email,
    templateKey: parsed.data.enabled ? "video_studio_enabled" : "video_studio_disabled",
    locale: target.preferred_locale,
    payload: { fullName: target.full_name, reason: parsed.data.reason },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
}
