import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { createSession, getDefaultPortalPath } from "@/lib/auth";
import { checkRateLimit } from "@/lib/redis";
import { logAudit } from "@/lib/audit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const allowed = await checkRateLimit(`login:${ip}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many login attempts" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password format" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const userRes = await query<{
    id: string;
    password_hash: string;
    role: "superadmin" | "teacher" | "student";
    status: "invited" | "active" | "suspended";
  }>(
    `SELECT id, password_hash, role, status FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );

  const user = userRes.rows[0];
  if (!user || user.status !== "active") {
    await logAudit({
      portalContext: "system",
      action: "auth.login_failed",
      resourceType: "user_session",
      resourceId: email,
      ipAddress: ip,
      metadata: { reason: "unknown_or_inactive" },
    }).catch(() => undefined);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const valid = await verifyPassword(user.password_hash, parsed.data.password);
  if (!valid) {
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      portalContext: "system",
      action: "auth.login_failed",
      resourceType: "user_session",
      resourceId: user.id,
      ipAddress: ip,
      metadata: { reason: "bad_password" },
    }).catch(() => undefined);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  await createSession(user.id, {
    ipAddress: ip,
    userAgent: req.headers.get("user-agent"),
  });

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    portalContext: "system",
    action: "auth.login_succeeded",
    resourceType: "user_session",
    resourceId: user.id,
    ipAddress: ip,
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    redirectTo: getDefaultPortalPath(user.role),
  });
}
