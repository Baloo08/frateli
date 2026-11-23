import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { logAudit } from "@/lib/audit";

const reqSchema = z.object({
  justification: z.string().trim().min(10, "Justification must be at least 10 characters"),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (user.videoEditorEnabled) {
    return NextResponse.json({ ok: true, alreadyEnabled: true });
  }

  const body = await req.json().catch(() => null);
  const parsed = reqSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Justification (>= 10 characters) is required" }, { status: 400 });
  }

  const existing = await query(
    `SELECT id FROM capability_requests
     WHERE teacher_id = $1 AND capability = 'video_editor_enabled' AND status = 'pending'`,
    [user.id]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    return NextResponse.json({ ok: true, pending: true });
  }

  const res = await query<{ id: string }>(
    `INSERT INTO capability_requests (teacher_id, capability, justification)
     VALUES ($1, 'video_editor_enabled', $2) RETURNING id`,
    [user.id, parsed.data.justification]
  );

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    portalContext: "teach",
    action: "capability.studio_requested",
    resourceType: "capability_request",
    resourceId: res.rows[0].id,
    reason: parsed.data.justification,
  });

  return NextResponse.json({ ok: true, requestId: res.rows[0].id }, { status: 201 });
}
