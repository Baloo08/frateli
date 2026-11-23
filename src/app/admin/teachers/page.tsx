import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { AdminTeachersClient } from "@/components/AdminTeachersClient";

export const dynamic = "force-dynamic";

export default async function AdminTeachersPage() {
  const user = await requireRole(["superadmin"]);
  const locale = await getLocale(user.preferredLocale);

  const res = await query<{
    id: string;
    email: string;
    full_name: string;
    status: string;
    preferred_locale: "es" | "en";
    video_editor_enabled: boolean;
    specialty_es: string | null;
  }>(
    `SELECT u.id, u.email, u.full_name, u.status, u.preferred_locale, u.video_editor_enabled, tp.specialty_es
     FROM users u
     LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
     WHERE u.role = 'teacher'
     ORDER BY u.created_at DESC`
  );

  return (
    <AppShell user={user} locale={locale} activePortal="admin">
      <div className="stack">
        <div className="row">
          <Link href="/admin" className="btn">← {locale === "es" ? "Volver a Admin" : "Back to Admin"}</Link>
        </div>
        <AdminTeachersClient initialTeachers={res.rows} locale={locale} />
      </div>
    </AppShell>
  );
}
