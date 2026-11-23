import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { enqueueEmail, sendOutboxEmailNow } from "@/lib/email";

const smtpTestSchema = z.object({
  toEmail: z.string().email(),
});

export async function POST(req: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = smtpTestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Valid recipient email required" }, { status: 400 });
  }

  const outboxId = await enqueueEmail({
    recipientEmail: parsed.data.toEmail,
    templateKey: "course_published",
    locale: admin.preferredLocale,
    payload: {
      subject: "Prueba Google SMTP — Frateli Campus Virtual",
      message: "Tu configuración Google SMTP con clave de aplicación funciona correctamente desde la misma app.",
    },
  });

  const result = await sendOutboxEmailNow(outboxId);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
