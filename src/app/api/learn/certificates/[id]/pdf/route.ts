import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getObjectBuffer } from "@/lib/storage";
import { logAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const certRes = await query<{
    id: string;
    student_id: string;
    verification_code: string;
    pdf_storage_key: string;
    revoked_at: Date | null;
  }>(
    `SELECT id, student_id, verification_code, pdf_storage_key, revoked_at
     FROM certificates WHERE id = $1`,
    [id]
  );

  const cert = certRes.rows[0];
  if (!cert) return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  if (cert.student_id !== user.id && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (cert.revoked_at) {
    return NextResponse.json({ error: "Certificate has been revoked" }, { status: 410 });
  }

  const buffer = await getObjectBuffer(cert.pdf_storage_key);

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    portalContext: "learn",
    action: "certificate.downloaded",
    resourceType: "certificate",
    resourceId: cert.id,
  }).catch(() => undefined);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${cert.verification_code}.pdf"`,
    },
  });
}
