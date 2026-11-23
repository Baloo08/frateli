import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const user = await getCurrentUser();
  await destroySession();

  if (user) {
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      portalContext: "system",
      action: "auth.session_revoked",
      resourceType: "user_session",
      resourceId: user.id,
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
