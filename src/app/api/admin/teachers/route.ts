import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { hashPassword, randomToken, sha256Hex } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { enqueueEmail } from "@/lib/email";
import { getEnv } from "@/lib/env";
import { invalidateUserRbacCache } from "@/lib/redis";

const createTeacherSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().email(),
  preferredLocale: z.enum(["es", "en"]).default("es"),
  specialtyEs: z.string().optional(),
  specialtyEn: z.string().optional(),
  canPublishCourses: z.boolean().default(true),
  tempPassword: z.string().min(8).optional(),
});

const patchTeacherSchema = z.object({
  teacherId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().min(5),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const res = await query(
    `SELECT u.id, u.email, u.full_name, u.status, u.preferred_locale,
            u.video_editor_enabled, u.created_at, u.last_login_at,
            tp.specialty_es, tp.specialty_en, tp.can_publish_courses
     FROM users u
     LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
     WHERE u.role = 'teacher'
     ORDER BY u.created_at DESC`
  );

  return NextResponse.json({ teachers: res.rows });
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createTeacherSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid teacher payload" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const exists = await query(`SELECT 1 FROM users WHERE email = $1`, [email]);
  if (exists.rowCount && exists.rowCount > 0) {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }

  const rawInviteToken = randomToken(24);
  const inviteTokenHash = sha256Hex(rawInviteToken);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const initialSecret = parsed.data.tempPassword || randomToken(16);
  const passwordHash = await hashPassword(initialSecret);
  const initialStatus = parsed.data.tempPassword ? "active" : "invited";

  const teacherId = await withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (
         email, password_hash, full_name, role, status, preferred_locale,
         video_editor_enabled, invite_token_hash, invite_expires_at, created_by
       ) VALUES ($1, $2, $3, 'teacher', $4, $5, false, $6, $7, $8)
       RETURNING id`,
      [
        email,
        passwordHash,
        parsed.data.fullName,
        initialStatus,
        parsed.data.preferredLocale,
        parsed.data.tempPassword ? null : inviteTokenHash,
        parsed.data.tempPassword ? null : expiresAt,
        admin.id,
      ]
    );
    const id = inserted.rows[0].id;

    await client.query(
      `INSERT INTO teacher_profiles (user_id, specialty_es, specialty_en, can_publish_courses)
       VALUES ($1, $2, $3, $4)`,
      [
        id,
        parsed.data.specialtyEs || "Docencia General",
        parsed.data.specialtyEn || "General Instruction",
        parsed.data.canPublishCourses,
      ]
    );

    return id;
  });

  const inviteUrl = `${getEnv().NEXT_PUBLIC_APP_URL}/invite/${rawInviteToken}`;

  await logAudit({
    actorId: admin.id,
    actorRole: admin.role,
    portalContext: "admin",
    action: "user.teacher_created",
    resourceType: "user",
    resourceId: teacherId,
    afterState: { email, status: initialStatus, preferredLocale: parsed.data.preferredLocale },
  });

  await enqueueEmail({
    recipientUserId: teacherId,
    recipientEmail: email,
    templateKey: "invite_teacher",
    locale: parsed.data.preferredLocale,
    payload: { fullName: parsed.data.fullName, inviteUrl },
  }).catch(() => undefined);

  return NextResponse.json(
    { ok: true, teacherId, inviteUrl: parsed.data.tempPassword ? null : inviteUrl },
    { status: 201 }
  );
}

export async function PATCH(req: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchTeacherSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await query(`UPDATE users SET status = $2 WHERE id = $1 AND role = 'teacher'`, [
    parsed.data.teacherId,
    parsed.data.status,
  ]);
  await invalidateUserRbacCache(parsed.data.teacherId);

  await logAudit({
    actorId: admin.id,
    actorRole: admin.role,
    portalContext: "admin",
    action: "user.status_changed",
    resourceType: "user",
    resourceId: parsed.data.teacherId,
    reason: parsed.data.reason,
    afterState: { status: parsed.data.status },
  });

  return NextResponse.json({ ok: true });
}
