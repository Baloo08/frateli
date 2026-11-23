import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { hashPassword, sha256Hex } from "@/lib/crypto";
import { createSession, getDefaultPortalPath } from "@/lib/auth";

const acceptSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token or password (min 8 chars)" }, { status: 400 });
  }

  const tokenHash = sha256Hex(parsed.data.token);
  const userRes = await query<{
    id: string;
    role: "superadmin" | "teacher" | "student";
    invite_expires_at: Date;
  }>(
    `SELECT id, role, invite_expires_at
     FROM users
     WHERE invite_token_hash = $1 AND status = 'invited'
     LIMIT 1`,
    [tokenHash]
  );

  const user = userRes.rows[0];
  if (!user || user.invite_expires_at.getTime() < Date.now()) {
    return NextResponse.json({ error: "Invitation token is invalid or expired" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await query(
    `UPDATE users
     SET password_hash = $2,
         status = 'active',
         invite_token_hash = NULL,
         invite_expires_at = NULL
     WHERE id = $1`,
    [user.id, passwordHash]
  );

  await createSession(user.id, {
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    ok: true,
    redirectTo: getDefaultPortalPath(user.role),
  });
}
