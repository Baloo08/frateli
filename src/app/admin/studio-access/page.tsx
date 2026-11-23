import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { AdminStudioAccessClient } from "@/components/AdminStudioAccessClient";

export const dynamic = "force-dynamic";

export default async function AdminStudioAccessPage() {
  const user = await requireRole(["superadmin"]);
  const locale = await getLocale(user.preferredLocale);

  const [teachersRes, requestsRes] = await Promise.all([
    query<{ id: string; full_name: string; email: string; video_editor_enabled: boolean }>(
      `SELECT id, full_name, email, video_editor_enabled FROM users WHERE role = 'teacher' ORDER BY full_name ASC`
    ),
    query<{
      id: string;
      teacher_id: string;
      teacher_name: string;
      teacher_email: string;
      justification: string;
      status: string;
      created_at: Date;
    }>(
      `SELECT cr.id, cr.teacher_id, u.full_name AS teacher_name, u.email AS teacher_email,
              cr.justification, cr.status, cr.created_at
       FROM capability_requests cr
       JOIN users u ON u.id = cr.teacher_id
       ORDER BY cr.created_at DESC LIMIT 30`
    ),
  ]);

  return (
    <AppShell user={user} locale={locale} activePortal="admin">
      <div className="stack">
        <div className="row">
          <Link href="/admin" className="btn">← {locale === "es" ? "Volver a Admin" : "Back to Admin"}</Link>
        </div>
        <AdminStudioAccessClient
          teachers={teachersRes.rows}
          requests={requestsRes.rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }))}
          locale={locale}
        />
      </div>
    </AppShell>
  );
}
