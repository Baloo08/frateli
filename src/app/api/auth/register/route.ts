import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { createSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/redis";
import { logAudit } from "@/lib/audit";

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  preferredLocale: z.enum(["es", "en"]).default("es"),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const allowed = await checkRateLimit(`register:${ip}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid registration input" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const exists = await query(`SELECT 1 FROM users WHERE email = $1`, [email]);
  if (exists.rowCount && exists.rowCount > 0) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const inserted = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role, status, preferred_locale, video_editor_enabled)
     VALUES ($1, $2, $3, 'student', 'active', $4, false)
     RETURNING id`,
    [email, passwordHash, parsed.data.fullName, parsed.data.preferredLocale]
  );

  const userId = inserted.rows[0].id;
  await createSession(userId, { ipAddress: ip, userAgent: req.headers.get("user-agent") });

  await logAudit({
    actorId: userId,
    actorRole: "student",
    portalContext: "learn",
    action: "user.student_registered",
    resourceType: "user",
    resourceId: userId,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, redirectTo: "/learn" }, { status: 201 });
}
